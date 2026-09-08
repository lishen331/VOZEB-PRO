import type { RunningHubOutputMapping, SystemChannelAdvancedConfig, SystemChannelModelConfig } from "@/lib/auth/store";
import { sanitizeProviderMessage } from "@/lib/server/admin-channel-config";
import { isProviderBusinessError, providerTaskPath, readProviderError, readProviderString, readProviderValue } from "@/lib/server/provider-task-config";

type RunningHubConfig = (Pick<SystemChannelAdvancedConfig, "createPath" | "queryPath" | "taskIdField" | "resultField" | "statusField"> | Pick<SystemChannelModelConfig, "createPath" | "queryPath" | "taskIdField" | "resultField" | "statusField">) & {
    outputMappings?: RunningHubOutputMapping[];
    timeoutSeconds?: number;
};
type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type RunningHubOutput = RunningHubOutputMapping & { values: unknown[] };
export type RunningHubTaskQueryResult = {
    status: string;
    resultUrl?: string;
    resultUrls?: string[];
    resultText?: string;
    outputs?: RunningHubOutput[];
    querySummary?: { status?: string; resultCount: number; nodeIds: string[]; upstreamError?: string };
    raw: unknown;
};

export async function fetchRunningHubWorkflowJson(input: { baseUrl: string; apiKey: string; workflowId: string; fetchImpl?: FetchImplementation }): Promise<unknown> {
    const workflowId = input.workflowId.trim();
    if (!workflowId) throw new Error("RunningHub Workflow ID 未配置");
    return requestJson(input.baseUrl, "/api/openapi/getJsonApiFormat", input.apiKey, input.fetchImpl, {
        method: "POST",
        body: JSON.stringify({ workflowId, apiKey: input.apiKey }),
        headers: { "content-type": "application/json" },
    });
}

export async function submitRunningHubTask(input: { baseUrl: string; apiKey: string; config: RunningHubConfig; payload: Record<string, unknown>; fetchImpl?: FetchImplementation }) {
    const createPath = requiredConfig(input.config.createPath, "createPath");
    const taskIdField = requiredConfig(input.config.taskIdField, "taskIdField");
    const payload = isOfficialWorkflowCreatePath(createPath) ? { ...input.payload, apiKey: input.apiKey } : input.payload;
    const raw = await requestJson(input.baseUrl, createPath, input.apiKey, input.fetchImpl, { method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" } }, input.config.timeoutSeconds);
    const taskId = readProviderString(raw, taskIdField, []);
    if (!taskId) throw new Error("RunningHub 提交响应缺少配置的任务 ID 字段");
    return { taskId, raw };
}

function isOfficialWorkflowCreatePath(path: string) {
    return path.replace(/\/+$/, "").toLowerCase() === "/task/openapi/create";
}

export function isOfficialWorkflowQueryPath(path: string) {
    const normalized = path.replace(/\/+$/, "").toLowerCase();
    return normalized === "/openapi/v2/query" || normalized === "/task/openapi/status";
}

export async function queryRunningHubTask(input: { baseUrl: string; apiKey: string; config: RunningHubConfig; taskId: string; fetchImpl?: FetchImplementation }): Promise<RunningHubTaskQueryResult> {
    const configuredQueryPath = requiredConfig(input.config.queryPath, "queryPath");
    const officialQuery = isOfficialWorkflowQueryPath(configuredQueryPath);
    const queryPath = officialQuery ? configuredQueryPath : providerTaskPath(configuredQueryPath, input.taskId);
    const statusField = requiredConfig(input.config.statusField, "statusField");
    const resultField = requiredConfig(input.config.resultField, "resultField");
    const raw = await requestJson(
        input.baseUrl,
        queryPath,
        input.apiKey,
        input.fetchImpl,
        officialQuery ? { method: "POST", body: JSON.stringify({ apiKey: input.apiKey, taskId: input.taskId }), headers: { "content-type": "application/json" } } : { method: "GET" },
        input.config.timeoutSeconds,
        officialQuery,
    );
    if (officialQuery && hasOfficialFailureCode(raw)) {
        const message = sanitizeProviderMessage(readProviderError(raw), [input.apiKey]);
        throw new Error(message || "RunningHub 查询失败");
    }
    const officialData = officialQuery ? unwrapOfficialResponse(raw) : undefined;
    const officialResultList = officialData !== undefined ? readOfficialResultList(officialData) : undefined;
    const officialResults = officialResultList ? normalizeOfficialResults(officialResultList) : undefined;
    const configuredStatus = officialData !== undefined ? readProviderString(officialData, "status", []) : readProviderString(raw, statusField, []);
    const status = configuredStatus || (officialQuery ? (officialResults?.length ? "SUCCESS" : "RUNNING") : "");
    const result = officialResults ?? readProviderValue(raw, resultField);
    const outputs = officialResults ? resolveOfficialOutputs(officialResults, input.config.outputMappings || []) : resolveOutputs(result, raw, input.config.outputMappings || []);
    const resultUrls = uniqueStrings(outputs.length ? outputs.flatMap((output) => output.values.flatMap(collectUrls)) : officialResults && input.config.outputMappings?.length ? [] : collectUrls(result));
    const resultText =
        outputs.flatMap((output) => (output.assetType === "TEXT" ? output.values.filter((value): value is string => typeof value === "string" && !isUrlLike(value)) : [])).join("\n") ||
        (typeof result === "string" && !isUrlLike(result) ? result : undefined);
    if (!status) throw new Error("RunningHub 查询响应缺少状态字段");
    if (isSuccessfulStatus(status) && result === undefined) throw new Error("RunningHub 查询响应未返回结果列表");
    // 查询摘要会持久化并展示，必须在离开 Provider 边界前清除渠道密钥。
    const upstreamError = officialData !== undefined ? sanitizeProviderMessage(readProviderString(officialData, "errorMessage / failedReason / error", []), [input.apiKey]) : undefined;
    const querySummary = officialQuery
        ? { status, resultCount: officialResultList?.length || 0, nodeIds: uniqueStrings((officialResults || []).flatMap((result) => (result.nodeId ? [result.nodeId] : []))), ...(upstreamError ? { upstreamError } : {}) }
        : undefined;
    return {
        status,
        ...(resultUrls[0] ? { resultUrl: resultUrls[0] } : {}),
        ...(resultUrls.length > 1 || input.config.outputMappings?.length ? { resultUrls } : {}),
        ...(resultText ? { resultText } : {}),
        ...(outputs.length ? { outputs } : isStructured(result) ? { outputs: [{ key: "result", label: "结果", assetType: "TEXT", required: false, values: [result] }] } : {}),
        ...(querySummary ? { querySummary } : {}),
        raw,
    };
}

type OfficialRunningHubResult = { url?: string; fileUrl?: string; fileType?: string; nodeId?: string; taskCostTime?: string; text?: string };

function hasOfficialFailureCode(raw: unknown) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const code = (raw as Record<string, unknown>).code;
    if (code === undefined || code === null || code === "") return false;
    return !["0", "200", "201", "202", "ok", "success"].includes(String(code).trim().toLowerCase());
}
function unwrapOfficialResponse(raw: unknown) {
    const data = readProviderValue(raw, "data");
    return data === undefined || data === null ? raw : data;
}

function readOfficialResultList(data: unknown): unknown[] | undefined {
    if (Array.isArray(data)) return data;
    const value = readProviderValue(data, "results / data");
    return Array.isArray(value) ? value : undefined;
}

function normalizeOfficialResults(results: unknown[]): OfficialRunningHubResult[] {
    return results.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        const result: OfficialRunningHubResult = {};
        for (const key of ["url", "fileUrl", "fileType", "nodeId", "taskCostTime"] as const) {
            const value = record[key];
            if (typeof value === "string" && value.trim()) result[key] = value.trim();
            else if (typeof value === "number") result[key] = String(value);
        }
        result.text = readProviderString(record, "text / content / value", []);
        return result.url || result.fileUrl || result.text ? [result] : [];
    });
}

function resolveOfficialOutputs(results: OfficialRunningHubResult[], mappings: RunningHubOutputMapping[]): RunningHubOutput[] {
    return mappings.flatMap((mapping) => {
        const candidates = mapping.nodeId ? results.filter((result) => result.nodeId === mapping.nodeId) : results;
        const resolved = mapping.assetType === "TEXT" ? candidates.flatMap((result) => (result.text ? [result.text] : [])) : candidates.filter((result) => result.url || result.fileUrl);
        const values = mapping.matchMode === "FIRST" ? resolved.slice(0, 1) : resolved;
        return values.length ? [{ ...mapping, values }] : [];
    });
}

export async function uploadRunningHubMedia(input: { baseUrl: string; apiKey: string; file: Blob; fileName: string; fetchImpl?: FetchImplementation }) {
    const form = new FormData();
    form.append("file", input.file, input.fileName);
    const raw = await requestJson(input.baseUrl, "/openapi/v2/media/upload/binary", input.apiKey, input.fetchImpl, { method: "POST", body: form });
    const url = readProviderString(raw, "data.fileName / fileName", []);
    if (!url) throw new Error("RunningHub 媒体上传响应缺少 fileName");
    return url;
}

async function requestJson(baseUrl: string, path: string, apiKey: string, fetchImpl: FetchImplementation | undefined, init: RequestInit, timeoutSeconds?: number, allowBusinessFailure = false) {
    const request = fetchImpl || fetch;
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${apiKey.trim()}`);
    const timeout = typeof timeoutSeconds === "number" && Number.isFinite(timeoutSeconds) && timeoutSeconds > 0 ? AbortSignal.timeout(timeoutSeconds * 1000) : undefined;
    const response = await request(providerUrl(baseUrl, path), { ...init, ...(timeout ? { signal: timeout } : {}), headers, cache: "no-store" });
    const raw = (await response.json().catch(() => null)) as unknown;
    if (!response.ok || !raw || (!allowBusinessFailure && isProviderBusinessError(raw))) {
        const rawMessage = readProviderError(raw);
        const message = rawMessage && apiKey.trim() ? rawMessage.replaceAll(apiKey.trim(), "[redacted]") : rawMessage;
        throw new Error(message || `RunningHub 请求失败（${response.status}）`);
    }
    return raw;
}

function isSuccessfulStatus(status: string) {
    return ["success", "succeeded", "completed", "done", "finished"].includes(status.trim().toLowerCase());
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
