import { randomUUID } from "node:crypto";

import { getFreshAuthSettings, setAuthSettings, type AuthSettings, type SystemModelChannel } from "@/lib/auth/store";
import type { RunningHubWorkflowConfig } from "@/lib/auth/store-types";
import { isRunningHubWorkflowBusinessCode, nextWorkflowVersion, normalizeRunningHubWorkflowConfig, validateRunningHubWorkflowConfig, workflowRequiresRetest } from "./runninghub-workflow-domain";
import { analyzeRunningHubWorkflowJson, type RunningHubWorkflowDiscovery } from "./runninghub-workflow-discovery";
import { fetchRunningHubWorkflowJson } from "./runninghub-provider";
import { demoRunningHubWorkflowCatalog } from "./runninghub-demo-workflow-catalog";
import { createHash } from "node:crypto";

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
    requiresRetest: boolean;
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

export async function getWorkflowExecution(workflowKey: string) {
    const found = findWorkflow(await getFreshAuthSettings(), workflowKey);
    if (!found) throw new RunningHubWorkflowError("工作流不存在", 404);
    if (found.channel.advancedConfig?.protocol !== "runninghub") throw new RunningHubWorkflowError("工作流渠道协议无效", 400);
    return { config: found.config, channel: found.channel };
}

export async function getWorkflowChannel(channelId: string) {
    const settings = await getFreshAuthSettings();
    const channel = settings.systemChannels.find((item) => item.id === channelId);
    if (!channel) throw new RunningHubWorkflowError("工作流渠道不存在", 404);
    if (channel.advancedConfig?.protocol !== "runninghub") throw new RunningHubWorkflowError("工作流渠道协议无效", 400);
    return channel;
}

export async function discoverWorkflow(input: { channelId: string; workflowIdOrUrl: string; capability: "text" | "image" | "video" | "audio" }): Promise<RunningHubWorkflowDiscovery> {
    const channel = await getWorkflowChannel(input.channelId);
    const workflowId = parseWorkflowId(input.workflowIdOrUrl);
    if (!workflowId) throw new RunningHubWorkflowError("Workflow ID 必须是数字或包含数字 ID 的完整链接", 400);
    const raw = await fetchRunningHubWorkflowJson({ baseUrl: channel.baseUrl, apiKey: channel.apiKey || "", workflowId });
    return analyzeRunningHubWorkflowJson({ workflowId, raw: unwrapWorkflowJson(raw), capability: input.capability });
}

export async function initializeDemoRunningHubWorkflows(input: { channelId: string; overwrite?: boolean }) {
    const settings = await getFreshAuthSettings();
    const channel = requireRunningHubChannel(settings, text(input.channelId));
    const existing = workflowConfigs(channel);
    const byCode = new Map(existing.map((config) => [config.workflowCode || config.workflowKey, config]));
    const workflowKeys: string[] = [];
    let added = 0;
    let updated = 0;
    let skipped = 0;
    const merged = [...existing];
    for (const demo of demoRunningHubWorkflowCatalog()) {
        const candidate = normalizeRunningHubWorkflowConfig({ ...demo, channelId: channel.id });
        const current = byCode.get(candidate.workflowCode || candidate.workflowKey);
        if (!current) {
            merged.push(candidate);
            workflowKeys.push(candidate.workflowKey);
            added += 1;
            continue;
        }
        workflowKeys.push(current.workflowKey);
        if (input.overwrite === true) {
            const replacement = normalizeRunningHubWorkflowConfig({ ...candidate, workflowKey: current.workflowKey, version: current.version, enabled: current.enabled, lastTestAt: current.lastTestAt, lastTestResult: current.lastTestResult, lastTestError: current.lastTestError, lastTestConfigFingerprint: current.lastTestConfigFingerprint });
            merged.splice(merged.findIndex((item) => item.workflowKey === current.workflowKey), 1, replacement);
            updated += 1;
        } else {
            skipped += 1;
        }
    }
    if (added || updated) await setAuthSettings({ systemChannels: replaceWorkflow(settings, channel.id, merged) });
    return { added, updated, skipped, workflowKeys };
}

export async function fetchAndSaveWorkflowJson(workflowKey: string) {
    const settings = await getFreshAuthSettings();
    const found = findWorkflow(settings, workflowKey);
    if (!found) throw new RunningHubWorkflowError("工作流不存在", 404);
    const raw = await fetchRunningHubWorkflowJson({ baseUrl: found.channel.baseUrl, apiKey: found.channel.apiKey || "", workflowId: found.config.workflowId });
    const unwrapped = unwrapWorkflowJson(raw);
    const workflowApiJson = workflowJsonText(raw, unwrapped);
    const workflowJsonFingerprint = createHash("sha256").update(stableJson(unwrapped)).digest("hex");
    const candidate = normalizeRunningHubWorkflowConfig({ ...found.config, workflowApiJson, workflowJsonFingerprint });
    const saved = await setAuthSettings({ systemChannels: replaceWorkflow(settings, found.channel.id, channelConfigsWithReplacement(found.channel, candidate)) });
    const persisted = findWorkflow(saved, found.config.workflowKey)?.config || candidate;
    return { workflowKey: persisted.workflowKey, workflowCode: persisted.workflowCode, workflowJsonFingerprint: persisted.workflowJsonFingerprint, nodeCount: countWorkflowNodes(unwrapped), savedAt: new Date().toISOString() };
}

export async function createWorkflow(input: unknown) {
    const settings = await getFreshAuthSettings();
    const raw = asRecord(input);
    const channelId = text(raw.channelId);
    const channel = requireRunningHubChannel(settings, channelId);
    if (!isRunningHubWorkflowBusinessCode(raw.businessCode)) throw new RunningHubWorkflowError("businessCode 无效");
    const workflowId = parseWorkflowId(raw.workflowId);
    if (!workflowId) throw new RunningHubWorkflowError("Workflow ID 必须是数字或包含数字 ID 的完整链接");
    const workflowKey = `workflow-${randomUUID()}`;
    const candidate = normalizeRunningHubWorkflowConfig({
        ...raw,
        workflowId,
        workflowKey,
        providerType: "runninghub",
        version: 1,
        enabled: false,
        testRequired: true,
        lastTestAt: undefined,
        lastTestResult: undefined,
        lastTestError: undefined,
        lastTestConfigFingerprint: undefined,
    });
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
        ...(Object.prototype.hasOwnProperty.call(raw, "workflowId") ? { workflowId: parseWorkflowId(raw.workflowId) } : {}),
        workflowKey: found.config.workflowKey,
        version: found.config.version,
        providerType: "runninghub",
        channelId: found.channel.id,
        enabled: false,
        testRequired: true,
        lastTestAt: found.config.lastTestAt,
        lastTestResult: found.config.lastTestResult,
        lastTestError: found.config.lastTestError,
        lastTestConfigFingerprint: undefined,
    });
    if (!candidate.workflowId) throw new RunningHubWorkflowError("Workflow ID 必须是数字或包含数字 ID 的完整链接");
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
    if (input.activateVersion === true) throw new RunningHubWorkflowError("复制的新版本必须先提交样例测试后才能启用", 409);
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
        enabled: false,
        providerType: "runninghub",
        channelId: found.channel.id,
        businessCode: found.config.businessCode,
        capability: found.config.capability,
        lastTestAt: undefined,
        lastTestResult: undefined,
        lastTestError: undefined,
        lastTestConfigFingerprint: undefined,
        testRequired: true,
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
    if (enabled) ensureEnableEvidence(candidate, found.config.enabled);
    assertValid(
        candidate,
        configs.filter((config) => config.workflowKey !== workflowKey),
    );
    const saved = await setAuthSettings({ systemChannels: replaceWorkflow(settings, found.channel.id, configs) });
    const persisted = findWorkflow(saved, workflowKey);
    return publicWorkflow(persisted?.config || candidate, persisted?.channel || found.channel);
}

export async function deleteWorkflow(workflowKey: string) {
    const settings = await getFreshAuthSettings();
    const found = findWorkflow(settings, workflowKey);
    if (!found) throw new RunningHubWorkflowError("工作流不存在", 404);
    if (found.config.enabled) throw new RunningHubWorkflowError("无法删除已启用的工作流，请先停用", 409);
    const configs = workflowConfigs(found.channel).filter((config) => config.workflowKey !== workflowKey);
    await setAuthSettings({ systemChannels: replaceWorkflow(settings, found.channel.id, configs) });
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

function ensureEnableEvidence(candidate: RunningHubWorkflowConfig, legacyEnabled = false) {
    if (legacyEnabled && !candidate.testRequired && !candidate.workflowJsonFingerprint && !candidate.lastTestConfigFingerprint) return;
    if (workflowRequiresRetest(candidate) || (!candidate.workflowJsonFingerprint && !candidate.lastTestConfigFingerprint)) throw new RunningHubWorkflowError("启用前请先提交当前配置的成功样例测试", 409);
}

function publicWorkflow(config: RunningHubWorkflowConfig, channel: SystemModelChannel): PublicRunningHubWorkflow {
    const { requestTemplate, ...safe } = config;
    return { ...safe, requestTemplate: requestTemplate ? undefined : "", requestTemplateConfigured: Boolean(requestTemplate), channelName: channel.name, requiresRetest: workflowRequiresRetest(config) };
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

function unwrapWorkflowJson(raw: unknown) {
    const data = asRecord(asRecord(raw).data);
    if (typeof data.prompt !== "string") return raw;
    try {
        const parsed = JSON.parse(data.prompt) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return raw;
        const workflowType = text(data.workflowType) || text(data.workflow_type);
        return workflowType ? { workflowType, ...(parsed as Record<string, unknown>) } : parsed;
    } catch {
        return raw;
    }
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function workflowJsonText(raw: unknown, unwrapped: unknown) {
    if (typeof unwrapped === "string") return unwrapped;
    return JSON.stringify(unwrapped);
}

function stableJson(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
    if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
    return JSON.stringify(value);
}

function countWorkflowNodes(value: unknown) {
    const record = asRecord(value);
    return Object.values(record).filter((item) => item && typeof item === "object" && !Array.isArray(item) && "class_type" in (item as Record<string, unknown>)).length;
}

function positiveInteger(value: unknown, fallback: number) {
    return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

export function parseWorkflowId(value: unknown) {
    const raw = text(value);
    if (!raw) return "";
    if (/^\d+$/.test(raw)) return raw;
    try {
        const url = new URL(raw);
        for (const key of ["workflowId", "workflow_id", "workflow", "id"]) {
            const candidate = url.searchParams.get(key)?.trim() || "";
            if (/^\d+$/.test(candidate)) return candidate;
        }
        const pathSegments = url.pathname.split("/").filter(Boolean);
        for (let index = 0; index < pathSegments.length - 1; index += 1) {
            if (/^workflows?$/i.test(pathSegments[index]) && /^\d+$/.test(pathSegments[index + 1])) return pathSegments[index + 1];
        }
        const parts = `${url.pathname} ${url.hash}`.match(/\d{6,}/g) || [];
        return parts.length === 1 ? parts[0] : "";
    } catch {
        return "";
    }
}
