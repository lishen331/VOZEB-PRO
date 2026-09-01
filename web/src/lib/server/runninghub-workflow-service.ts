import { randomUUID } from "node:crypto";

import { getFreshAuthSettings, setAuthSettings, type AuthSettings, type SystemModelChannel } from "@/lib/auth/store";
import type { RunningHubWorkflowConfig } from "@/lib/auth/store-types";
import { isRunningHubWorkflowBusinessCode, nextWorkflowVersion, normalizeRunningHubWorkflowConfig, validateRunningHubWorkflowConfig } from "./runninghub-workflow-domain";

export class RunningHubWorkflowError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "RunningHubWorkflowError";
    }
}

export type PublicRunningHubWorkflow = Omit<RunningHubWorkflowConfig, "requestTemplate"> & {
    requestTemplate?: string;
    requestTemplateConfigured: boolean;
    channelName: string;
};

export type RunningHubWorkflowListResult = {
    items: PublicRunningHubWorkflow[];
    total: number;
    page: number;
    pageSize: number;
};

export type RunningHubWorkflowListInput = {
    search?: string;
    businessCode?: string;
    capability?: string;
    status?: "enabled" | "disabled";
    channelId?: string;
    page?: number;
    pageSize?: number;
};

export async function listWorkflows(input: RunningHubWorkflowListInput = {}): Promise<RunningHubWorkflowListResult> {
    const settings = await getFreshAuthSettings();
    const search = text(input.search).toLowerCase();
    const all = workflowEntries(settings).filter(({ config, channel }) => {
        if (input.channelId && channel.id !== input.channelId) return false;
        if (input.businessCode && config.businessCode !== input.businessCode) return false;
        if (input.capability && config.capability !== input.capability) return false;
        if (input.status && (config.enabled ? "enabled" : "disabled") !== input.status) return false;
        if (search && ![config.workflowName, config.workflowKey, config.businessCode, config.workflowId, channel.name].some((value) => value.toLowerCase().includes(search))) return false;
        return true;
    });
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(100, positiveInteger(input.pageSize, 20));
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize).map(({ config, channel }) => publicWorkflow(config, channel)), total: all.length, page, pageSize };
}

export async function getWorkflow(workflowKey: string) {
    const found = findWorkflow(await getFreshAuthSettings(), workflowKey);
    if (!found) throw new RunningHubWorkflowError("工作流不存在", 404);
    return publicWorkflow(found.config, found.channel);
}

export async function createWorkflow(input: unknown) {
    const settings = await getFreshAuthSettings();
    const raw = asRecord(input);
    const channelId = text(raw.channelId);
    const channel = requireRunningHubChannel(settings, channelId);
    if (!isRunningHubWorkflowBusinessCode(raw.businessCode)) throw new RunningHubWorkflowError("businessCode 无效");
    const workflowKey = `workflow-${randomUUID()}`;
    const candidate = normalizeRunningHubWorkflowConfig({ ...raw, workflowKey, providerType: "runninghub", version: 1, enabled: false, lastTestAt: undefined, lastTestResult: undefined, lastTestError: undefined });
    assertValid(
        candidate,
        workflowEntries(settings).map((entry) => entry.config),
    );
    const nextChannels = replaceWorkflow(settings, channel.id, [...workflowConfigs(channel), candidate]);
    const saved = await setAuthSettings({ systemChannels: nextChannels });
    const persisted = findWorkflow(saved, candidate.workflowKey)?.config || candidate;
    return publicWorkflow(persisted, findWorkflow(saved, candidate.workflowKey)?.channel || channel);
}

export async function updateWorkflow(workflowKey: string, input: unknown) {
    const settings = await getFreshAuthSettings();
    const found = findWorkflow(settings, workflowKey);
    if (!found) throw new RunningHubWorkflowError("工作流不存在", 404);
    if (found.config.enabled) throw new RunningHubWorkflowError("启用版本不能原地编辑，请复制新版本", 409);
    const raw = asRecord(input);
    const candidate = normalizeRunningHubWorkflowConfig({
        ...found.config,
        ...raw,
        workflowKey: found.config.workflowKey,
        version: found.config.version,
        providerType: "runninghub",
        enabled: false,
        lastTestAt: found.config.lastTestAt,
        lastTestResult: found.config.lastTestResult,
        lastTestError: found.config.lastTestError,
    });
    assertValid(
        candidate,
        workflowEntries(settings)
            .filter((entry) => entry.config.workflowKey !== workflowKey)
            .map((entry) => entry.config),
    );
    const nextChannels = replaceWorkflow(settings, found.channel.id, channelConfigsWithReplacement(found.channel, candidate));
    const saved = await setAuthSettings({ systemChannels: nextChannels });
    const persisted = findWorkflow(saved, workflowKey);
    return publicWorkflow(persisted?.config || candidate, persisted?.channel || found.channel);
}

export async function copyWorkflowVersion(workflowKey: string, input: { config?: unknown; activateVersion?: boolean } = {}) {
    const settings = await getFreshAuthSettings();
    const found = findWorkflow(settings, workflowKey);
    if (!found) throw new RunningHubWorkflowError("工作流不存在", 404);
    const rawOverrides = asRecord(input.config);
    const version = nextWorkflowVersion(
        workflowEntries(settings).map((entry) => entry.config),
        found.channel.id,
        found.config.businessCode,
    );
    const nextKey = uniqueWorkflowKey(settings, `${found.config.workflowKey}-v${version}`);
    const candidate = normalizeRunningHubWorkflowConfig({
        ...found.config,
        ...rawOverrides,
        workflowKey: nextKey,
        version,
        enabled: input.activateVersion === true,
        providerType: "runninghub",
        channelId: found.channel.id,
        businessCode: found.config.businessCode,
        capability: found.config.capability,
        lastTestAt: undefined,
        lastTestResult: undefined,
        lastTestError: undefined,
    });
    const all = workflowEntries(settings).map((entry) => entry.config);
    if (candidate.enabled) for (const sibling of all) if (sibling.channelId === candidate.channelId && sibling.businessCode === candidate.businessCode) sibling.enabled = false;
    assertValid(
        candidate,
        all.filter((entry) => entry.workflowKey !== candidate.workflowKey),
    );
    const nextSourceConfigs = workflowConfigs(found.channel).map((config) => all.find((item) => item.workflowKey === config.workflowKey) || config);
    nextSourceConfigs.push(candidate);
    const nextChannels = replaceWorkflow(settings, found.channel.id, nextSourceConfigs);
    const saved = await setAuthSettings({ systemChannels: nextChannels });
    const persisted = findWorkflow(saved, candidate.workflowKey);
    return publicWorkflow(persisted?.config || candidate, persisted?.channel || found.channel);
}

export async function activateWorkflowVersion(workflowKey: string) {
    return setWorkflowEnabled(workflowKey, true);
}

export async function setWorkflowEnabled(workflowKey: string, enabled: boolean) {
    const settings = await getFreshAuthSettings();
    const found = findWorkflow(settings, workflowKey);
    if (!found) throw new RunningHubWorkflowError("工作流不存在", 404);
    const configs = workflowConfigs(found.channel).map((config) => ({ ...config, enabled: config.workflowKey === workflowKey ? enabled : enabled && config.businessCode === found.config.businessCode ? false : config.enabled }));
    const candidate = configs.find((config) => config.workflowKey === workflowKey) || found.config;
    assertValid(
        candidate,
        configs.filter((config) => config.workflowKey !== workflowKey),
    );
    const saved = await setAuthSettings({ systemChannels: replaceWorkflow(settings, found.channel.id, configs) });
    const persisted = findWorkflow(saved, workflowKey);
    return publicWorkflow(persisted?.config || candidate, persisted?.channel || found.channel);
}

function workflowEntries(settings: AuthSettings) {
    return settings.systemChannels.flatMap((channel) => workflowConfigs(channel).map((config) => ({ channel, config })));
}

function findWorkflow(settings: AuthSettings, workflowKey: string) {
    const key = text(workflowKey);
    return workflowEntries(settings).find(({ config }) => config.workflowKey === key);
}

function workflowConfigs(channel: SystemModelChannel) {
    return Object.values(channel.advancedConfig?.workflowConfigs || {}).map(normalizeRunningHubWorkflowConfig);
}

function channelConfigsWithReplacement(channel: SystemModelChannel, candidate: RunningHubWorkflowConfig, replaceKey = candidate.workflowKey) {
    const configs = workflowConfigs(channel).map((config) => (config.workflowKey === replaceKey ? candidate : config));
    if (!configs.some((config) => config.workflowKey === candidate.workflowKey)) configs.push(candidate);
    return configs;
}

function replaceWorkflow(settings: AuthSettings, channelId: string, configs: RunningHubWorkflowConfig[]) {
    return settings.systemChannels.map((channel) => {
        if (channel.id !== channelId) return channel;
        const advancedConfig = channel.advancedConfig || {
            protocol: "runninghub" as const,
            textModel: "",
            imageModel: "",
            videoModel: "",
            createPath: "",
            queryPath: "",
            requestTemplate: "",
            resultField: "",
            statusField: "",
            durationRange: "",
            referenceRule: "",
            supportsReferenceImage: false,
            supportsReferenceVideo: false,
            supportsReferenceAudio: false,
        };
        return { ...channel, advancedConfig: { ...advancedConfig, workflowConfigs: Object.fromEntries(configs.map((config) => [config.workflowKey, config])) } };
    });
}

function requireRunningHubChannel(settings: AuthSettings, channelId: string) {
    const channel = settings.systemChannels.find((item) => item.id === channelId);
    if (!channel) throw new RunningHubWorkflowError("RunningHub 渠道不存在", 404);
    if (channel.advancedConfig?.protocol !== "runninghub") throw new RunningHubWorkflowError("工作流只能绑定 RunningHub 渠道", 400);
    if (channel.purpose !== "open-source-practice" && channel.purpose !== "shared") throw new RunningHubWorkflowError("工作流渠道用途必须为无限练习或共享", 400);
    return channel;
}

function assertValid(candidate: RunningHubWorkflowConfig, siblings: readonly RunningHubWorkflowConfig[]) {
    const errors = validateRunningHubWorkflowConfig(candidate, siblings);
    if (errors.length) throw new RunningHubWorkflowError(errors[0]);
    if (siblings.some((sibling) => sibling.enabled && candidate.enabled && sibling.channelId === candidate.channelId && sibling.businessCode === candidate.businessCode && sibling.workflowKey !== candidate.workflowKey))
        throw new RunningHubWorkflowError("同一渠道和业务 code 只能启用一个工作流版本", 409);
}

function publicWorkflow(config: RunningHubWorkflowConfig, channel: SystemModelChannel): PublicRunningHubWorkflow {
    const { requestTemplate, ...safe } = config;
    return { ...safe, requestTemplate: requestTemplate ? undefined : "", requestTemplateConfigured: Boolean(requestTemplate), channelName: channel.name };
}

function uniqueWorkflowKey(settings: AuthSettings, base: string) {
    const keys = new Set(workflowEntries(settings).map(({ config }) => config.workflowKey));
    let result = base.slice(0, 160);
    let suffix = 2;
    while (keys.has(result)) result = `${base.slice(0, 150)}-${suffix++}`;
    return result;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function positiveInteger(value: unknown, fallback: number) {
    return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}
