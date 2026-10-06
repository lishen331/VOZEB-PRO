import type { VideoGenerationReference } from "@/lib/video-reference-contract";

export type ModelBayAssetType = "image" | "video" | "audio";
export type ModelBayAssetStatus = "pending" | "active" | "failed" | "deleted" | string;

export type ModelBayAssetRecord = {
    taskId: string;
    assetId?: string;
    status: ModelBayAssetStatus;
    type?: ModelBayAssetType;
    label?: string;
    error?: unknown;
};

type ModelBayAssetResponse = {
    id?: unknown;
    task_id?: unknown;
    asset_id?: unknown;
    status?: unknown;
    type?: unknown;
    label?: unknown;
    error?: unknown;
};

type ModelBayAssetFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type ModelBayAssetServiceOptions = {
    baseUrl: string;
    apiKey: string;
    fetcher?: ModelBayAssetFetch;
    signal?: AbortSignal;
    pollAttempts?: number;
    pollIntervalMs?: number;
};

export type ModelBayAssetSource = {
    url: string;
    type: ModelBayAssetType;
    label?: string;
};

export class ModelBayAssetError extends Error {
    constructor(
        message: string,
        readonly details: { status?: number; code?: string; taskId?: string; assetId?: string; response?: unknown } = {},
    ) {
        super(message);
        this.name = "ModelBayAssetError";
    }
}

/**
 * Returns the ModelBay official-assets endpoint without duplicating the
 * provider prefix when an administrator saved the full API path as base URL.
 */
export function modelBayAssetsBaseUrl(baseUrl: string) {
    const normalized = baseUrl.trim().replace(/\/+$/, "");
    if (!normalized) throw new ModelBayAssetError("ModelBay 渠道缺少 Base URL");
    return normalized.toLowerCase().endsWith("/doubao/api/v3") ? normalized : `${normalized}/doubao/api/v3`;
}

export function modelBayAssetUrl(assetId: string) {
    const value = assetId.trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{2,254}$/.test(value)) throw new ModelBayAssetError("ModelBay 素材 ID 格式不正确", { assetId: value });
    return `asset://${value}`;
}

export function isModelBayAssetReference(value: string) {
    return /^asset:\/\/[a-zA-Z0-9][a-zA-Z0-9._:-]{2,254}$/.test(value.trim());
}

export async function ingestModelBayAsset(source: ModelBayAssetSource, options: ModelBayAssetServiceOptions): Promise<ModelBayAssetRecord> {
    const url = source.url.trim();
    if (!/^https?:\/\//i.test(url)) throw new ModelBayAssetError("ModelBay 素材入库只接受公网 HTTP(S) URL");
    if (!source.type || !["image", "video", "audio"].includes(source.type)) throw new ModelBayAssetError("ModelBay 素材类型不受支持");
    const response = await modelBayRequest(options, "/assets", {
        method: "POST",
        body: JSON.stringify({ url, type: source.type, ...(source.label?.trim() ? { label: source.label.trim() } : {}) }),
    });
    const created = await parseAssetResponse(response, "ModelBay 素材入库失败");
    const taskId = readId(created.task_id) || readId(created.id);
    const assetId = readId(created.asset_id);
    const status = readStatus(created.status) || (assetId ? "active" : "pending");
    if (!taskId && !assetId) throw new ModelBayAssetError("ModelBay 素材入库响应缺少 task ID 和 asset ID", { response: created });
    if (status === "failed") throw assetFailure(created, taskId, assetId);
    if (status === "active" && assetId) return { taskId: taskId || assetId, assetId, status, type: source.type, label: source.label };
    if (!taskId) throw new ModelBayAssetError("ModelBay 素材仍在处理中但响应缺少 task ID", { response: created, assetId });
    return pollModelBayAsset(taskId, { ...options, signal: options.signal }, { type: source.type, label: source.label, initial: { ...created, id: taskId, asset_id: assetId, status } });
}

export async function pollModelBayAsset(taskId: string, options: ModelBayAssetServiceOptions, metadata: { type?: ModelBayAssetType; label?: string; initial?: ModelBayAssetResponse } = {}): Promise<ModelBayAssetRecord> {
    const normalizedTaskId = taskId.trim();
    if (!normalizedTaskId) throw new ModelBayAssetError("ModelBay 素材轮询缺少 task ID");
    const attempts = Math.max(1, Math.floor(options.pollAttempts ?? 30));
    const intervalMs = Math.max(0, Math.floor(options.pollIntervalMs ?? 2_000));
    let latest = metadata.initial;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
        if (attempt > 0 || !latest || !isTerminalAssetStatus(readStatus(latest.status))) {
            if (attempt > 0 && intervalMs) await delay(intervalMs, options.signal);
            const response = await modelBayRequest(options, `/assets/${encodeURIComponent(normalizedTaskId)}`, { method: "GET" });
            latest = await parseAssetResponse(response, "ModelBay 素材状态查询失败");
        }
        const status = readStatus(latest.status) || "pending";
        const assetId = readId(latest.asset_id);
        if (status === "active") {
            if (!assetId) throw new ModelBayAssetError("ModelBay 素材已 active 但响应缺少 asset_id", { taskId: normalizedTaskId, response: latest });
            return { taskId: normalizedTaskId, assetId, status, type: metadata.type || readAssetType(latest.type), label: metadata.label || readLabel(latest.label) };
        }
        if (["failed", "deleted", "expired"].includes(status)) throw assetFailure(latest, normalizedTaskId, assetId);
    }
    throw new ModelBayAssetError(`ModelBay 素材入库超时（已轮询 ${attempts} 次）`, { taskId: normalizedTaskId, assetId: readId(latest?.asset_id), response: latest });
}

/** Converts only ModelBay-ingested references; existing asset:// values are reused. */
export async function ingestModelBayReferences(references: readonly VideoGenerationReference[], options: ModelBayAssetServiceOptions, labels: Partial<Record<VideoGenerationReference["type"], string>> = {}) {
    const cache = new Map<string, string>();
    const converted: VideoGenerationReference[] = [];
    for (const reference of references) {
        const value = reference.url.trim();
        if (isModelBayAssetReference(value)) {
            converted.push({ ...reference, url: value });
            continue;
        }
        const type = reference.type;
        if (type !== "image" && type !== "video" && type !== "audio") throw new ModelBayAssetError(`ModelBay 不支持 ${type} 素材入库`);
        const key = `${type}\0${value}`;
        let assetUrl = cache.get(key);
        if (!assetUrl) {
            const record = await ingestModelBayAsset({ url: value, type, label: labels[type] }, options);
            if (!record.assetId) throw new ModelBayAssetError("ModelBay 素材入库成功但没有 asset_id", { taskId: record.taskId });
            assetUrl = modelBayAssetUrl(record.assetId);
            cache.set(key, assetUrl);
        }
        converted.push({ ...reference, url: assetUrl });
    }
    return converted;
}

async function modelBayRequest(options: ModelBayAssetServiceOptions, path: string, init: RequestInit) {
    const fetcher = options.fetcher || fetch;
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${options.apiKey.trim()}`);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetcher(`${modelBayAssetsBaseUrl(options.baseUrl)}${path}`, { ...init, headers, signal: options.signal });
    if (!response.ok) {
        const responseBody = await readJsonSafely(response);
        throw new ModelBayAssetError(`ModelBay 素材接口返回 HTTP ${response.status}`, { status: response.status, code: readErrorCode(responseBody), response: responseBody });
    }
    return response;
}

async function parseAssetResponse(response: Response, fallback: string): Promise<ModelBayAssetResponse> {
    const body = await readJsonSafely(response);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new ModelBayAssetError(fallback, { status: response.status, response: body });
    const object = body as ModelBayAssetResponse;
    if (object.error) throw new ModelBayAssetError(readErrorMessage(object.error) || fallback, { status: response.status, code: readErrorCode(object.error), response: body });
    return object;
}

async function readJsonSafely(response: Response) {
    const text = await response.text();
    if (!text.trim()) return undefined;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return { message: text.slice(0, 500) };
    }
}

function assetFailure(response: ModelBayAssetResponse, taskId?: string, assetId?: string) {
    return new ModelBayAssetError(readErrorMessage(response.error) || `ModelBay 素材状态为 ${readStatus(response.status) || "failed"}`, { code: readErrorCode(response.error), taskId, assetId, response });
}

function readId(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function readStatus(value: unknown) { return typeof value === "string" && value.trim() ? value.trim().toLowerCase() : undefined; }
function readLabel(value: unknown) { return typeof value === "string" && value.trim() ? value.trim() : undefined; }
function readAssetType(value: unknown): ModelBayAssetType | undefined { return value === "image" || value === "video" || value === "audio" ? value : undefined; }
function readErrorCode(value: unknown) { return value && typeof value === "object" && !Array.isArray(value) && typeof (value as { code?: unknown }).code === "string" ? (value as { code: string }).code : undefined; }
function readErrorMessage(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && !Array.isArray(value)) {
        const object = value as { message?: unknown; error?: unknown };
        return typeof object.message === "string" ? object.message : readErrorMessage(object.error);
    }
    return undefined;
}
function isTerminalAssetStatus(status: string | undefined) { return status === "active" || status === "failed" || status === "deleted" || status === "expired"; }
function delay(ms: number, signal?: AbortSignal) { return new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, ms); if (signal) { if (signal.aborted) { clearTimeout(timer); reject(signal.reason); return; } signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true }); } }); }

