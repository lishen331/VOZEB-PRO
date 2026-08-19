import type { SystemChannelAdvancedConfig, SystemChannelModelConfig } from "@/lib/auth/store";
import { isProviderBusinessError, providerTaskPath, readProviderError, readProviderString } from "@/lib/server/provider-task-config";

type RunningHubConfig = Pick<SystemChannelAdvancedConfig, "createPath" | "queryPath" | "taskIdField" | "resultField" | "statusField"> | Pick<SystemChannelModelConfig, "createPath" | "queryPath" | "taskIdField" | "resultField" | "statusField">;
type FetchImplementation = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function submitRunningHubTask(input: { baseUrl: string; apiKey: string; config: RunningHubConfig; payload: Record<string, unknown>; fetchImpl?: FetchImplementation }) {
    const createPath = requiredConfig(input.config.createPath, "createPath");
    const taskIdField = requiredConfig(input.config.taskIdField, "taskIdField");
    const raw = await requestJson(input.baseUrl, createPath, input.apiKey, input.fetchImpl, { method: "POST", body: JSON.stringify(input.payload), headers: { "content-type": "application/json" } });
    const taskId = readProviderString(raw, taskIdField, []);
    if (!taskId) throw new Error("RunningHub 提交响应缺少配置的任务 ID 字段");
    return { taskId, raw };
}

export async function queryRunningHubTask(input: { baseUrl: string; apiKey: string; config: RunningHubConfig; taskId: string; fetchImpl?: FetchImplementation }) {
    const queryPath = providerTaskPath(requiredConfig(input.config.queryPath, "queryPath"), input.taskId);
    const statusField = requiredConfig(input.config.statusField, "statusField");
    const resultField = requiredConfig(input.config.resultField, "resultField");
    const raw = await requestJson(input.baseUrl, queryPath, input.apiKey, input.fetchImpl, { method: "GET" });
    const status = readProviderString(raw, statusField, []);
    const resultUrl = readProviderString(raw, resultField, []);
    if (!status && !resultUrl) throw new Error("RunningHub 查询响应缺少配置的状态或结果字段");
    return { status, ...(resultUrl ? { resultUrl } : {}), raw };
}

export async function uploadRunningHubMedia(input: { baseUrl: string; apiKey: string; file: Blob; fileName: string; fetchImpl?: FetchImplementation }) {
    const form = new FormData();
    form.append("file", input.file, input.fileName);
    const raw = await requestJson(input.baseUrl, "/openapi/v2/media/upload/binary", input.apiKey, input.fetchImpl, { method: "POST", body: form });
    const url = readProviderString(raw, "data.download_url / download_url", []);
    if (!url) throw new Error("RunningHub 媒体上传响应缺少 download_url");
    return url;
}

async function requestJson(baseUrl: string, path: string, apiKey: string, fetchImpl: FetchImplementation | undefined, init: RequestInit) {
    const request = fetchImpl || fetch;
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${apiKey.trim()}`);
    const response = await request(providerUrl(baseUrl, path), { ...init, headers, cache: "no-store" });
    const raw = (await response.json().catch(() => null)) as unknown;
    if (!response.ok || !raw || isProviderBusinessError(raw)) throw new Error(readProviderError(raw) || `RunningHub 请求失败（${response.status}）`);
    return raw;
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
