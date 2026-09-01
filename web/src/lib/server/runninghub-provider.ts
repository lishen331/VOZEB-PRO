import type { RunningHubOutputMapping, SystemChannelAdvancedConfig, SystemChannelModelConfig } from "@/lib/auth/store";
import { isProviderBusinessError, providerTaskPath, readProviderError, readProviderString, readProviderValue } from "@/lib/server/provider-task-config";

type RunningHubConfig = (Pick<SystemChannelAdvancedConfig, "createPath" | "queryPath" | "taskIdField" | "resultField" | "statusField"> | Pick<SystemChannelModelConfig, "createPath" | "queryPath" | "taskIdField" | "resultField" | "statusField">) & {
    outputMappings?: RunningHubOutputMapping[];
    timeoutSeconds?: number;
};
type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type RunningHubOutput = RunningHubOutputMapping & { values: unknown[] };
export type RunningHubTaskQueryResult = { status: string; resultUrl?: string; resultUrls?: string[]; resultText?: string; outputs?: RunningHubOutput[]; raw: unknown };

export async function submitRunningHubTask(input: { baseUrl: string; apiKey: string; config: RunningHubConfig; payload: Record<string, unknown>; fetchImpl?: FetchImplementation }) {
    const createPath = requiredConfig(input.config.createPath, "createPath");
    const taskIdField = requiredConfig(input.config.taskIdField, "taskIdField");
    const raw = await requestJson(input.baseUrl, createPath, input.apiKey, input.fetchImpl, { method: "POST", body: JSON.stringify(input.payload), headers: { "content-type": "application/json" } }, input.config.timeoutSeconds);
    const taskId = readProviderString(raw, taskIdField, []);
    if (!taskId) throw new Error("RunningHub 提交响应缺少配置的任务 ID 字段");
    return { taskId, raw };
}

export async function queryRunningHubTask(input: { baseUrl: string; apiKey: string; config: RunningHubConfig; taskId: string; fetchImpl?: FetchImplementation }): Promise<RunningHubTaskQueryResult> {
    const queryPath = providerTaskPath(requiredConfig(input.config.queryPath, "queryPath"), input.taskId);
    const statusField = requiredConfig(input.config.statusField, "statusField");
    const resultField = requiredConfig(input.config.resultField, "resultField");
    const raw = await requestJson(input.baseUrl, queryPath, input.apiKey, input.fetchImpl, { method: "GET" }, input.config.timeoutSeconds);
    const status = readProviderString(raw, statusField, []);
    const result = readProviderValue(raw, resultField);
    const outputs = resolveOutputs(result, raw, input.config.outputMappings || []);
    const resultUrls = uniqueStrings(outputs.length ? outputs.flatMap((output) => output.values.flatMap(collectUrls)) : collectUrls(result));
    const resultText =
        outputs.flatMap((output) => (output.assetType === "TEXT" ? output.values.filter((value): value is string => typeof value === "string" && !isUrlLike(value)) : [])).join("\n") ||
        (typeof result === "string" && !isUrlLike(result) ? result : undefined);
    if (!status && result === undefined) throw new Error("RunningHub 查询响应缺少配置的状态或结果字段");
    return {
        status,
        ...(resultUrls[0] ? { resultUrl: resultUrls[0] } : {}),
        ...(resultUrls.length > 1 || input.config.outputMappings?.length ? { resultUrls } : {}),
        ...(resultText ? { resultText } : {}),
        ...(outputs.length ? { outputs } : isStructured(result) ? { outputs: [{ key: "result", label: "结果", assetType: "TEXT", required: false, values: [result] }] } : {}),
        raw,
    };
}

export async function uploadRunningHubMedia(input: { baseUrl: string; apiKey: string; file: Blob; fileName: string; fetchImpl?: FetchImplementation }) {
    const form = new FormData();
    form.append("file", input.file, input.fileName);
    const raw = await requestJson(input.baseUrl, "/openapi/v2/media/upload/binary", input.apiKey, input.fetchImpl, { method: "POST", body: form });
    const url = readProviderString(raw, "data.download_url / download_url", []);
    if (!url) throw new Error("RunningHub 媒体上传响应缺少 download_url");
    return url;
}

async function requestJson(baseUrl: string, path: string, apiKey: string, fetchImpl: FetchImplementation | undefined, init: RequestInit, timeoutSeconds?: number) {
    const request = fetchImpl || fetch;
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${apiKey.trim()}`);
    const timeout = typeof timeoutSeconds === "number" && Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? AbortSignal.timeout(timeoutSeconds * 1000) : undefined;
    const response = await request(providerUrl(baseUrl, path), { ...init, ...(timeout ? { signal: timeout } : {}), headers, cache: "no-store" });
    const raw = (await response.json().catch(() => null)) as unknown;
    if (!response.ok || !raw || isProviderBusinessError(raw)) throw new Error(readProviderError(raw) || `RunningHub 请求失败（${response.status}）`);
    return raw;
}

function resolveOutputs(result: unknown, raw: unknown, mappings: RunningHubOutputMapping[]): RunningHubOutput[] {
    if (mappings.length) {
        return mappings.flatMap((mapping) => {
            const value =
                readProviderValue(result, mapping.key) ??
                (mapping.nodeId ? (readProviderValue(result, `nodes.${mapping.nodeId}.${mapping.key}`) ?? readProviderValue(result, `${mapping.nodeId}.${mapping.key}`)) : undefined) ??
                readProviderValue(raw, mapping.key) ??
                (mappings.length === 1 ? result : undefined);
            const values = value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
            return values.length ? [{ ...mapping, values }] : [];
        });
    }
    if (result === undefined || result === null) return [];
    return [];
}

function isStructured(value: unknown): value is Record<string, unknown> | unknown[] {
    return Boolean(value && typeof value === "object");
}

function collectUrls(value: unknown): string[] {
    if (typeof value === "string") return isUrlLike(value) ? [value.trim()] : [];
    if (Array.isArray(value)) return value.flatMap(collectUrls);
    if (!value || typeof value !== "object") return [];
    return Object.values(value as Record<string, unknown>).flatMap(collectUrls);
}

function isUrlLike(value: string) {
    return /^(?:https?:|data:|\/api\/)/i.test(value.trim());
}

function uniqueStrings(values: string[]) {
    return Array.from(new Set(values));
}

function providerUrl(baseUrl: string, path: string) {
    const base = baseUrl.trim().replace(/\/+$/, "");
    if (!/^https?:\/\//i.test(base)) throw new Error("RunningHub base URL 无效");
    return `${base}/${path.trim().replace(/^\/+/, "")}`;
}

function requiredConfig(value: string | undefined, name: string) {
    const text = value?.trim();
    if (!text) throw new Error(`RunningHub ${name} 未配置`);
    return text;
}
