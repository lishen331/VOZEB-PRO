import { createHash } from "node:crypto";
import type { LogicalModelCapability, RunningHubWorkflowBusinessCode, RunningHubWorkflowConfig, RunningHubWorkflowInputField, RunningHubNodeMapping, RunningHubOutputMapping, SystemChannelAdvancedConfig } from "@/lib/auth/store-types";

export type { RunningHubNodeMapping, RunningHubWorkflowBusinessCode, RunningHubWorkflowConfig, RunningHubWorkflowInputField, RunningHubOutputMapping } from "@/lib/auth/store-types";

export const RUNNINGHUB_WORKFLOW_BUSINESS_CODES = ["script", "storyboard-image", "storyboard-video", "dubbing", "music", "canvas", "drama"] as const;
export type RunningHubWorkflowConfigStore = NonNullable<SystemChannelAdvancedConfig["workflowConfigs"]>;

const CAPABILITY_BY_BUSINESS_CODE: Record<RunningHubWorkflowBusinessCode, LogicalModelCapability> = {
    script: "text",
    "storyboard-image": "image",
    "storyboard-video": "video",
    dubbing: "audio",
    music: "audio",
    canvas: "image",
    drama: "text",
};

const INPUT_TYPES = ["text", "textarea", "image", "images", "video", "audio", "number", "enum", "boolean"] as const;
const NODE_VALUE_TYPES = ["STRING", "NUMBER", "BOOLEAN", "JSON"] as const;
const NODE_SOURCES = ["INPUT", "INPUT_OR_DEFAULT"] as const;
const OUTPUT_TYPES = ["IMAGE", "VIDEO", "AUDIO", "TEXT"] as const;

export function workflowCapabilityForBusinessCode(value: unknown): LogicalModelCapability | undefined {
    return isRunningHubWorkflowBusinessCode(value) ? CAPABILITY_BY_BUSINESS_CODE[value] : undefined;
}

export function isRunningHubWorkflowBusinessCode(value: unknown): value is RunningHubWorkflowBusinessCode {
    return typeof value === "string" && (RUNNINGHUB_WORKFLOW_BUSINESS_CODES as readonly string[]).includes(value);
}

export function normalizeRunningHubWorkflowConfig(value: unknown): RunningHubWorkflowConfig {
    const input = asRecord(value);
    const businessCode = isRunningHubWorkflowBusinessCode(input.businessCode) ? input.businessCode : "script";
    const capability = isCapability(input.capability) ? input.capability : CAPABILITY_BY_BUSINESS_CODE[businessCode];
    return {
        workflowKey: text(input.workflowKey, 160),
        workflowName: text(input.workflowName, 160),
        businessCode,
        capability,
        providerType: "runninghub",
        channelId: text(input.channelId, 160),
        workflowId: text(input.workflowId, 240),
        version: positiveInteger(input.version, 1),
        enabled: input.enabled === true,
        createPath: path(input.createPath) || "/task/openapi/create",
        queryPath: path(input.queryPath) || "/openapi/v2/query",
        taskIdField: text(input.taskIdField, 500) || "data.taskId",
        statusField: text(input.statusField, 500) || "data.status",
        resultField: text(input.resultField, 500) || "data.result",
        requestTemplate: text(input.requestTemplate, 12_000) || "{}",
        inputSchema: normalizeInputSchema(input.inputSchema),
        nodeMappings: normalizeNodeMappings(input.nodeMappings),
        outputMappings: normalizeOutputMappings(input.outputMappings),
        ...(input.testRequired === true ? { testRequired: true } : {}),
        ...(text(input.workflowJsonFingerprint, 128) ? { workflowJsonFingerprint: text(input.workflowJsonFingerprint, 128) } : {}),
        ...(text(input.lastTestConfigFingerprint, 128) ? { lastTestConfigFingerprint: text(input.lastTestConfigFingerprint, 128) } : {}),
        ...(positiveInteger(input.timeoutSeconds, 0) ? { timeoutSeconds: positiveInteger(input.timeoutSeconds, 0) } : {}),
        ...(normalizeRunOptions(input.runOptions) ? { runOptions: normalizeRunOptions(input.runOptions) } : {}),
        ...(text(input.lastTestAt, 80) ? { lastTestAt: text(input.lastTestAt, 80) } : {}),
        ...(input.lastTestResult === "success" || input.lastTestResult === "failed" ? { lastTestResult: input.lastTestResult } : {}),
        ...(text(input.lastTestError, 500) ? { lastTestError: text(input.lastTestError, 500) } : {}),
    };
}

export function validateRunningHubWorkflowConfig(value: unknown, siblings: readonly unknown[] = []): string[] {
    const input = asRecord(value);
    const normalized = normalizeRunningHubWorkflowConfig(value);
    const errors: string[] = [];
    if (!isRunningHubWorkflowBusinessCode(input.businessCode)) errors.push("businessCode 必须是受支持的无限练习业务 code");
    if (!isCapability(input.capability)) errors.push("capability 必须是 text、image、video 或 audio");
    else if (isRunningHubWorkflowBusinessCode(input.businessCode) && input.capability !== CAPABILITY_BY_BUSINESS_CODE[input.businessCode]) errors.push(`capability 与 businessCode 不匹配，应为 ${CAPABILITY_BY_BUSINESS_CODE[input.businessCode]}`);
    if (input.providerType !== "runninghub") errors.push("providerType 必须为 runninghub");
    for (const field of ["workflowKey", "workflowName", "channelId", "workflowId", "createPath", "queryPath", "taskIdField", "statusField", "resultField", "requestTemplate"] as const) {
        if (!text(normalized[field], field === "requestTemplate" ? 12_000 : 500)) errors.push(`${field} 不能为空`);
    }
    if (input.version !== undefined && (typeof input.version !== "number" || !Number.isSafeInteger(input.version) || input.version <= 0)) errors.push("version 必须为正整数");
    if (!Array.isArray(input.inputSchema)) errors.push("inputSchema 必须是数组");
    if (!Array.isArray(input.nodeMappings)) errors.push("nodeMappings 必须是数组");
    if (!Array.isArray(input.outputMappings)) errors.push("outputMappings 必须是数组");

    const inputKeys = new Set<string>();
    for (const [index, raw] of (Array.isArray(input.inputSchema) ? input.inputSchema : []).entries()) {
        const field = asRecord(raw);
        const path = `inputSchema[${index}]`;
        const key = text(field.key, 160);
        if (!key) errors.push(`${path}.key 不能为空`);
        else if (inputKeys.has(key)) errors.push(`${path}.key 重复`);
        else inputKeys.add(key);
        if (!text(field.label, 160)) errors.push(`${path}.label 不能为空`);
        if (!(INPUT_TYPES as readonly unknown[]).includes(field.type)) errors.push(`${path}.type 无效`);
        if (typeof field.required !== "boolean") errors.push(`${path}.required 必须是布尔值`);
        if (field.type === "enum" && (!Array.isArray(field.options) || !field.options.length || field.options.some((option) => !text(option, 160)))) errors.push(`${path}.options 必须包含有效选项`);
        if (field.defaultValue !== undefined && !isJsonPrimitive(field.defaultValue)) errors.push(`${path}.defaultValue 类型无效`);
    }

    const mappingKeys = new Set<string>();
    for (const [index, raw] of (Array.isArray(input.nodeMappings) ? input.nodeMappings : []).entries()) {
        const mapping = asRecord(raw);
        const path = `nodeMappings[${index}]`;
        for (const field of ["paramKey", "nodeId", "fieldName", "inputKey"] as const) if (!text(mapping[field], 200)) errors.push(`${path}.${field} 不能为空`);
        if (!inputKeys.has(text(mapping.inputKey, 160))) errors.push(`${path}.inputKey 必须引用 inputSchema`);
        if (!(NODE_VALUE_TYPES as readonly unknown[]).includes(mapping.valueType)) errors.push(`${path}.valueType 无效`);
        if (!(NODE_SOURCES as readonly unknown[]).includes(mapping.source)) errors.push(`${path}.source 无效`);
        const paramKey = text(mapping.paramKey, 160);
        if (paramKey && mappingKeys.has(paramKey)) errors.push(`${path}.paramKey 重复`);
        if (paramKey) mappingKeys.add(paramKey);
        if (mapping.defaultValue !== undefined && !isJsonPrimitive(mapping.defaultValue)) errors.push(`${path}.defaultValue 类型无效`);
    }

    const outputKeys = new Set<string>();
    for (const [index, raw] of (Array.isArray(input.outputMappings) ? input.outputMappings : []).entries()) {
        const mapping = asRecord(raw);
        const path = `outputMappings[${index}]`;
        const key = text(mapping.key, 160);
        if (!key) errors.push(`${path}.key 不能为空`);
        else if (outputKeys.has(key)) errors.push(`${path}.key 重复`);
        else outputKeys.add(key);
        if (!text(mapping.label, 160)) errors.push(`${path}.label 不能为空`);
        if (!(OUTPUT_TYPES as readonly unknown[]).includes(mapping.assetType)) errors.push(`${path}.assetType 无效`);
        if (typeof mapping.required !== "boolean") errors.push(`${path}.required 必须是布尔值`);
        if (mapping.primary !== undefined && typeof mapping.primary !== "boolean") errors.push(`${path}.primary 必须是布尔值`);
        if (mapping.nodeId !== undefined && !text(mapping.nodeId, 200)) errors.push(`${path}.nodeId 不能为空`);
    }

    const evidenceRequired = input.testRequired === true || Boolean(text(input.workflowJsonFingerprint, 128) || text(input.lastTestConfigFingerprint, 128));
    if (input.enabled && evidenceRequired) {
        if (!normalized.inputSchema.length || !normalized.nodeMappings.length || !normalized.outputMappings.length) errors.push("启用前必须确认至少一个输入映射、节点映射和输出映射");
        if (input.lastTestResult !== "success" || text(input.lastTestConfigFingerprint, 128) !== runningHubWorkflowConfigFingerprint(input)) errors.push("启用前必须存在当前配置对应的成功测试证据");
    }
    const duplicateEnabled = siblings.filter((sibling) => {
        const candidate = normalizeRunningHubWorkflowConfig(sibling);
        return candidate.enabled && normalized.enabled && candidate.channelId === normalized.channelId && candidate.businessCode === normalized.businessCode;
    }).length;
    if (duplicateEnabled > 1) errors.push("enabled: 同一 channelId + businessCode 只能存在一个启用版本");
    return errors;
}

export function nextWorkflowVersion(configs: readonly unknown[], channelId: string, businessCode: RunningHubWorkflowBusinessCode) {
    const versions = configs
        .map(normalizeRunningHubWorkflowConfig)
        .filter((config) => config.channelId === channelId && config.businessCode === businessCode)
        .map((config) => config.version)
        .filter((version) => Number.isSafeInteger(version) && version > 0);
    const highest = versions.length ? Math.max(...versions) : 0;
    return highest < Number.MAX_SAFE_INTEGER ? highest + 1 : 1;
}

export function resolveEnabledWorkflow(configs: readonly unknown[], channelId: string, businessCode: RunningHubWorkflowBusinessCode) {
    return configs
        .map(normalizeRunningHubWorkflowConfig)
        .filter((config) => config.enabled && config.channelId === channelId && config.businessCode === businessCode && !workflowRequiresRetest(config))
        .sort((left, right) => right.version - left.version)[0];
}

export function runningHubWorkflowConfigFingerprint(value: unknown): string {
    const input = asRecord(value);
    const payload = {
        workflowId: text(input.workflowId, 240),
        businessCode: text(input.businessCode, 160),
        capability: text(input.capability, 40),
        workflowJsonFingerprint: text(input.workflowJsonFingerprint, 128),
        createPath: path(input.createPath) || "/task/openapi/create",
        queryPath: path(input.queryPath) || "/openapi/v2/query",
        taskIdField: text(input.taskIdField, 500) || "data.taskId",
        statusField: text(input.statusField, 500) || "data.status",
        resultField: text(input.resultField, 500) || "data.result",
        requestTemplate: text(input.requestTemplate, 12_000) || "{}",
        runOptions: normalizeRunOptions(input.runOptions) || null,
        timeoutSeconds: positiveInteger(input.timeoutSeconds, 0) || null,
        inputSchema: sortByKey(normalizeInputSchema(input.inputSchema), "key"),
        nodeMappings: sortByKey(normalizeNodeMappings(input.nodeMappings), "paramKey"),
        outputMappings: sortByKey(normalizeOutputMappings(input.outputMappings), "key"),
    };
    return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export function workflowRequiresRetest(value: unknown): boolean {
    const input = asRecord(value);
    const recorded = text(input.lastTestConfigFingerprint, 128);
    if (input.testRequired !== true && !recorded && !text(input.workflowJsonFingerprint, 128)) return false;
    return input.lastTestResult !== "success" || recorded !== runningHubWorkflowConfigFingerprint(value);
}

function normalizeInputSchema(value: unknown): RunningHubWorkflowInputField[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((raw) => {
        const input = asRecord(raw);
        const type = INPUT_TYPES.includes(input.type as (typeof INPUT_TYPES)[number]) ? (input.type as RunningHubWorkflowInputField["type"]) : "text";
        const result: RunningHubWorkflowInputField = { key: text(input.key, 160), label: text(input.label, 160), type, required: input.required === true };
        const options = Array.isArray(input.options) ? input.options.map((option) => text(option, 160)).filter(Boolean) : [];
        if (options.length) result.options = options;
        if (input.defaultValue === null || isJsonPrimitive(input.defaultValue)) result.defaultValue = input.defaultValue as RunningHubWorkflowInputField["defaultValue"];
        return [result];
    });
}

function normalizeNodeMappings(value: unknown): RunningHubNodeMapping[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((raw) => {
        const input = asRecord(raw);
        const valueType = NODE_VALUE_TYPES.includes(input.valueType as (typeof NODE_VALUE_TYPES)[number]) ? (input.valueType as RunningHubNodeMapping["valueType"]) : "STRING";
        const source = NODE_SOURCES.includes(input.source as (typeof NODE_SOURCES)[number]) ? (input.source as RunningHubNodeMapping["source"]) : "INPUT";
        const result: RunningHubNodeMapping = { paramKey: text(input.paramKey, 160), nodeId: text(input.nodeId, 200), fieldName: text(input.fieldName, 200), valueType, source, inputKey: text(input.inputKey, 160) };
        if (input.defaultValue === null || isJsonPrimitive(input.defaultValue)) result.defaultValue = input.defaultValue as RunningHubNodeMapping["defaultValue"];
        return [result];
    });
}

function normalizeOutputMappings(value: unknown): RunningHubOutputMapping[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((raw) => {
        const input = asRecord(raw);
        const assetType = OUTPUT_TYPES.includes(input.assetType as (typeof OUTPUT_TYPES)[number]) ? (input.assetType as RunningHubOutputMapping["assetType"]) : "TEXT";
        const result: RunningHubOutputMapping = { key: text(input.key, 160), label: text(input.label, 160), assetType, required: input.required === true };
        if (text(input.nodeId, 200)) result.nodeId = text(input.nodeId, 200);
        if (typeof input.primary === "boolean") result.primary = input.primary;
        return [result];
    });
}

function normalizeRunOptions(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
    const entries = Object.entries(value as Record<string, unknown>).flatMap(([key, item]) => (isJsonPrimitive(item) ? [[text(key, 120), item] as const] : []));
    return entries.length ? Object.fromEntries(entries.filter(([key]) => key)) : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown, maxLength: number) {
    return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function path(value: unknown) {
    const normalized = text(value, 500);
    return normalized && !normalized.startsWith("/") ? `/${normalized}` : normalized;
}

function positiveInteger(value: unknown, fallback: number) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function isCapability(value: unknown): value is LogicalModelCapability {
    return value === "text" || value === "image" || value === "video" || value === "audio";
}

function isJsonPrimitive(value: unknown): value is string | number | boolean | null {
    return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function sortByKey<T extends Record<string, unknown>>(items: T[], key: string): T[] {
    return [...items].sort((left, right) => String(left[key] || "").localeCompare(String(right[key] || "")));
}

function stableStringify(value: unknown): string {
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
    if (value && typeof value === "object") {
        return `{${Object.entries(value as Record<string, unknown>)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
            .join(",")}}`;
    }
    return JSON.stringify(value);
}
