import { createHash, randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import { INLINE_IMAGE_TIMEOUT_MS, MAX_INLINE_IMAGE_BYTES, type ImageTaskMediaResult } from "@/app/api/image-tasks/image-task-types";
import { MAX_INPUT_PIXELS } from "./generated-image-normalizer";
import { fetchInternalApi } from "./internal-origin";
import { maintenanceWorkerContextHeaders } from "./maintenance-auth";
import { fetchSafeOutbound } from "./safe-outbound-fetch";

type Input = {
    value: string;
    origin: string;
    authContext?: string;
    remoteUrl?: string;
    internalHeaders?: HeadersInit;
    emit?: (event: Record<string, unknown>) => Promise<unknown>;
};

export class ImageResultMediaReadError extends Error {
    constructor(
        readonly code: string,
        readonly stage: string,
        readonly status?: number,
        options?: ErrorOptions,
    ) {
        super(`上游图片结果读取失败（${code}${status ? `，HTTP ${status}` : ""}）`, options);
        this.name = "ImageResultMediaReadError";
    }
}

/** Reads an existing generated result only. Never submits or retries a paid generation. */
export async function readImageResultMedia(input: Input): Promise<ImageTaskMediaResult> {
    const started = Date.now();
    const mediaReadId = randomUUID();
    const summary = mediaLocation(input.remoteUrl || input.value, input.origin);
    let stage = "connect";
    let status: number | undefined;
    let responseBytes = 0;
    let firstByteMs = -1;
    const emit = async (event: Record<string, unknown>) => {
        try {
            await input.emit?.({ mediaReadId, ...summary, ...event });
        } catch {
            /* Diagnostics must not fail delivery. */
        }
    };
    const controller = new AbortController();
    let timeout = setTimeout(() => controller.abort(), INLINE_IMAGE_TIMEOUT_MS);
    await emit({ phase: "result_media_start", method: "GET" });
    try {
        let bytes: Buffer;
        const inlinePrefix = input.value.match(/^data:image\/[a-z0-9.+-]+;base64,/i)?.[0];
        if (inlinePrefix) {
            stage = "decode";
            const encoded = input.value.slice(inlinePrefix.length);
            if (Math.floor((encoded.length * 3) / 4) - 2 > MAX_INLINE_IMAGE_BYTES) throw new ImageResultMediaReadError("media_too_large", stage);
            bytes = Buffer.from(encoded, "base64");
            responseBytes = bytes.length;
        } else {
            const url = new URL(input.value, input.origin);
            if (!["http:", "https:"].includes(url.protocol)) throw new ImageResultMediaReadError("media_invalid_url", stage);
            const internal = url.origin === new URL(input.origin).origin && url.pathname.startsWith("/api/");
            const headers = new Headers();
            if (internal) {
                headers.set("x-vozeb-media-read-id", mediaReadId);
                const worker = maintenanceWorkerContextHeaders(input.authContext || "");
                new Headers(worker || (input.authContext ? { cookie: input.authContext } : undefined)).forEach((v, k) => headers.set(k, v));
                new Headers(input.internalHeaders).forEach((v, k) => headers.set(k, v));
            }
            const response = await (internal ? fetchInternalApi : fetchSafeOutbound)(url.toString(), { headers, cache: "no-store", signal: controller.signal });
            stage = "headers";
            status = response.status;
            const rawLength = response.headers.get("content-length");
            const length = rawLength !== null && Number.isFinite(Number(rawLength)) && Number(rawLength) >= 0 ? Number(rawLength) : undefined;
            const final = response.url ? mediaLocation(response.url, input.origin) : {};
            await emit({ phase: "result_media_headers", status, contentType: response.headers.get("content-type") || undefined, contentLength: length, durationMs: Date.now() - started, finalHost: final.urlHost, finalPathHash: final.urlPathHash });
            if (!response.ok || !response.body || (length !== undefined && length > MAX_INLINE_IMAGE_BYTES)) {
                await response.body?.cancel().catch(() => undefined);
                throw new ImageResultMediaReadError(!response.ok ? "media_http_error" : !response.body ? "media_empty" : "media_too_large", stage, status);
            }
            stage = "body";
            // 大图走慢线路时 30s 不够读完正文（2026-10-23 生产 media_timeout）。拿到长度后按 0.1MB/s 补时间，最多 600s。
            clearTimeout(timeout);
            timeout = setTimeout(() => controller.abort(), resultMediaBodyTimeoutMs(length));
            const reader = response.body.getReader();
            const chunks: Uint8Array[] = [];
            try {
                while (true) {
                    const part = await reader.read();
                    if (part.done) break;
                    if (firstByteMs < 0) firstByteMs = Date.now() - started;
                    responseBytes += part.value.byteLength;
                    if (responseBytes > MAX_INLINE_IMAGE_BYTES) throw new ImageResultMediaReadError("media_too_large", stage, status);
                    chunks.push(part.value);
                }
            } catch (error) {
                await reader.cancel(error).catch(() => undefined);
                throw error;
            } finally {
                reader.releaseLock();
            }
            if (length !== undefined && (!response.headers.get("content-encoding") || response.headers.get("content-encoding") === "identity") && length !== responseBytes) throw new ImageResultMediaReadError("media_truncated", stage, status);
            bytes = Buffer.concat(chunks, responseBytes);
        }
        stage = "decode";
        if (!bytes.length) throw new ImageResultMediaReadError("media_empty", stage, status);
        if (bytes.length > MAX_INLINE_IMAGE_BYTES) throw new ImageResultMediaReadError("media_too_large", stage, status);
        const detected = await fileTypeFromBuffer(bytes);
        if (!detected?.mime.startsWith("image/")) throw new ImageResultMediaReadError("media_invalid_image", stage, status);
        const image = sharp(bytes, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS });
        const metadata = await image.metadata();
        if (!metadata.width || !metadata.height) throw new ImageResultMediaReadError("media_invalid_image", stage, status);
        // Metadata alone can accept truncated/corrupt pixel payloads. stats decodes without another raw output buffer.
        await image.stats();
        await emit({ phase: "result_media_complete", status, contentType: detected.mime, responseBytes, firstByteMs, width: metadata.width, height: metadata.height, durationMs: Date.now() - started });
        return { dataUrl: `data:${detected.mime};base64,${bytes.toString("base64")}`, remoteUrl: input.remoteUrl, width: metadata.width, height: metadata.height };
    } catch (cause) {
        const error =
            cause instanceof ImageResultMediaReadError
                ? cause
                : new ImageResultMediaReadError(controller.signal.aborted ? "media_timeout" : stage === "decode" ? "media_invalid_image" : stage === "body" ? "media_body_error" : "media_transport_error", stage, status, { cause });
        await emit({
            phase: "result_media_failed",
            stage: error.stage,
            status: error.status,
            errorCode: error.code,
            errorName: error.name,
            errorMessage: error.message,
            responseBytes,
            durationMs: Date.now() - started,
            cause: cause instanceof Error ? String((cause.cause as { code?: string } | undefined)?.code || cause.name) : undefined,
        });
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

const RESULT_MEDIA_MAX_TIMEOUT_MS = 600_000;

export function resultMediaBodyTimeoutMs(contentLength: number | undefined) {
    return Math.min(RESULT_MEDIA_MAX_TIMEOUT_MS, INLINE_IMAGE_TIMEOUT_MS + (contentLength && contentLength > 0 ? contentLength / 100 : 0));
}

function mediaLocation(value: string, origin: string) {
    if (value.startsWith("data:")) return {};
    try {
        const url = new URL(value, origin);
        return { urlHost: url.host, urlPathHash: createHash("sha256").update(url.pathname).digest("hex") };
    } catch {
        return {};
    }
}
