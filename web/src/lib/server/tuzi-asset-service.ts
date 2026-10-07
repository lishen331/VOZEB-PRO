import { createHash } from "node:crypto";

import { fileTypeFromBuffer } from "file-type";

import type { VideoGenerationReference } from "@/lib/video-reference-contract";

const TUZI_ASSET_MAX_BYTES = 30 * 1024 * 1024;
const TUZI_ASSET_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/bmp", "image/tiff"]);
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const assetCache = new Map<string, { reference: string; expiresAt: number }>();

type TuziFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type TuziAssetServiceOptions = {
    baseUrl: string;
    apiKey: string;
    cacheScope: string;
    fetcher?: TuziFetch;
    /** Reads reference bytes; defaults to the API fetcher. */
    sourceFetcher?: TuziFetch;
    pollIntervalMs?: number;
    timeoutMs?: number;
};

type TuziAssetData = { id?: unknown; reference?: unknown; status?: unknown; error_message?: unknown; compliance_started?: unknown };

export class TuziAssetError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "TuziAssetError";
    }
}

export function isTuziAssetReference(value: string) {
    return /^asset:\/\/[A-Za-z0-9._:-]{3,255}$/.test(value.trim());
}

/** Uploads one image, starts compliance once and waits for an active asset:// reference. */
export async function ingestTuziImageAsset(bytes: Buffer, options: TuziAssetServiceOptions) {
    const mimeType = (await fileTypeFromBuffer(bytes))?.mime?.toLowerCase() || "";
    if (!TUZI_ASSET_IMAGE_MIME_TYPES.has(mimeType)) throw new TuziAssetError("兔子素材库只接受 JPG/PNG/WebP/GIF/BMP/TIFF 图片");
    const cacheKey = `${options.cacheScope}\0${createHash("sha256").update(bytes).digest("hex")}`;
    const cached = assetCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.reference;

    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), `reference.${mimeType.split("/")[1] || "png"}`);
    const created = await tuziAssetRequest(options, "/v1/seedance/assets", { method: "POST", body: form }, "兔子素材上传失败");
    const id = readString(created.id);
    if (!id) throw new TuziAssetError("兔子素材上传响应缺少素材 ID");
    const assetPath = `/v1/seedance/assets/${encodeURIComponent(id)}`;
    let latest = await tuziAssetRequest(options, `${assetPath}/compliance`, { method: "POST" }, "兔子素材审核发起失败");

    const deadline = Date.now() + (options.timeoutMs ?? 180_000);
    const interval = options.pollIntervalMs ?? 3_000;
    for (;;) {
        const status = readString(latest.status)?.toLowerCase();
        const reference = readString(latest.reference);
        if (status === "active") {
            if (!reference || !isTuziAssetReference(reference)) throw new TuziAssetError("兔子素材已通过审核但响应缺少有效的 asset:// 引用");
            assetCache.set(cacheKey, { reference, expiresAt: Date.now() + CACHE_TTL_MS });
            return reference;
        }
        if (status === "failed" || status === "deleted") throw new TuziAssetError(`兔子素材审核未通过：${readString(latest.error_message) || status}`);
        if (Date.now() >= deadline) throw new TuziAssetError("兔子素材审核超时");
        if (interval) await new Promise((resolve) => setTimeout(resolve, interval + Math.floor(Math.random() * 1_000)));
        latest = await tuziAssetRequest(options, assetPath, { method: "GET" }, "兔子素材状态查询失败");
    }
}

/**
 * Converts image references to reviewed asset:// references. A failed ingest keeps the
 * original URL so non-person images still generate; real-person images then surface the
 * upstream rejection instead of a local error.
 */
export async function ingestTuziReferences(references: readonly VideoGenerationReference[], options: TuziAssetServiceOptions, onFallback?: (error: unknown) => void) {
    const converted: VideoGenerationReference[] = [];
    for (const reference of references) {
        if (reference.type !== "image" || isTuziAssetReference(reference.url)) {
            converted.push(reference);
            continue;
        }
        try {
            const bytes = await readReferenceBytes(reference.url, options.sourceFetcher || options.fetcher || fetch);
            converted.push({ ...reference, url: await ingestTuziImageAsset(bytes, options) });
        } catch (error) {
            onFallback?.(error);
            converted.push(reference);
        }
    }
    return converted;
}

export function clearTuziAssetCacheForTests() {
    assetCache.clear();
}

async function readReferenceBytes(url: string, fetcher: TuziFetch) {
    const dataUrl = url.match(/^data:image\/[\w.+-]+;base64,(.+)$/i);
    if (dataUrl) {
        const bytes = Buffer.from(dataUrl[1], "base64");
        if (bytes.byteLength > TUZI_ASSET_MAX_BYTES) throw new TuziAssetError("兔子素材图片不能超过 30MB");
        return bytes;
    }
    const response = await fetcher(url, { cache: "no-store" });
    if (!response.ok) throw new TuziAssetError(`参考图读取失败（HTTP ${response.status}）`);
    if (Number(response.headers.get("content-length") || 0) > TUZI_ASSET_MAX_BYTES) throw new TuziAssetError("兔子素材图片不能超过 30MB");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.byteLength) throw new TuziAssetError("参考图为空");
    if (bytes.byteLength > TUZI_ASSET_MAX_BYTES) throw new TuziAssetError("兔子素材图片不能超过 30MB");
    return bytes;
}

async function tuziAssetRequest(options: TuziAssetServiceOptions, path: string, init: RequestInit, fallback: string): Promise<TuziAssetData> {
    const fetcher = options.fetcher || fetch;
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${options.apiKey.trim()}`);
    const base = options.baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
    const response = await fetcher(`${base}${path}`, { ...init, headers, signal: AbortSignal.timeout(60_000) });
    const text = await response.text();
    let body: { success?: unknown; message?: unknown; data?: TuziAssetData } | undefined;
    try {
        body = text.trim() ? JSON.parse(text) : undefined;
    } catch {
        body = undefined;
    }
    // HTTP 200 can still carry success:false (e.g. the token group lacks an asset adapter).
    if (!response.ok || body?.success !== true || !body.data || typeof body.data !== "object") {
        const message = readString(body?.message);
        throw new TuziAssetError(`${fallback}${message ? `：${message}` : `（HTTP ${response.status}）`}`);
    }
    return body.data;
}

function readString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
