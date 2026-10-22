import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import { CREATIVE_UPLOAD_MAX_BYTES } from "@/lib/creative-upload";
import { originalImageSourceUrl } from "@/lib/media-image-url";
import { fetchInternalApi } from "@/lib/server/internal-origin";
import { createSignedReferenceAssetUrl } from "@/lib/server/reference-asset-access";
import { writeReferenceMediaDataUrl } from "@/lib/server/reference-asset-store";
import { fetchSafeOutbound } from "@/lib/server/safe-outbound-fetch";
import type { VideoGenerationReference } from "@/lib/video-reference-contract";
import { fitVideoReferenceSize, VIDEO_REFERENCE_MAX_SIDE, VIDEO_REFERENCE_MIN_SIDE } from "@/lib/video-reference-size";

const UPSTREAM_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg"]);

export async function normalizeVideoProviderImageReferences(input: { references: VideoGenerationReference[]; userId: string; internalOrigin: string; publicOrigin: string }) {
    return Promise.all(input.references.map((reference) => normalizeReference(reference, input)));
}

async function normalizeReference(reference: VideoGenerationReference, context: { userId: string; internalOrigin: string; publicOrigin: string }) {
    if (reference.type !== "image") return reference;
    const sourceReference = { ...reference, url: originalImageSourceUrl(reference.url) };
    const source = await readReferenceImage(sourceReference.url, context);
    if (!source.mimeType.startsWith("image/")) throw new Error("视频参考素材不是有效图片");
    const image = sharp(source.bytes, { failOn: "error" }).rotate();
    const { width = 0, height = 0, orientation } = await image.metadata();
    const [w, h] = orientation && orientation >= 5 ? [height, width] : [width, height];
    const fitted = fitVideoReferenceSize(w, h);
    if (fitted === "impossible") throw new Error(`参考图比例过于狭长（${w}×${h}），无法满足视频模型每边 ${VIDEO_REFERENCE_MIN_SIDE}–${VIDEO_REFERENCE_MAX_SIDE} 像素的要求，请先裁剪`);
    if (!fitted && UPSTREAM_IMAGE_MIME_TYPES.has(source.mimeType)) return sourceReference;

    const png = await (fitted ? image.resize(fitted.width, fitted.height, { fit: "fill" }) : image).png().toBuffer();
    const asset = await writeReferenceMediaDataUrl(`data:image/png;base64,${png.toString("base64")}`, "image", {
        ownerUserId: context.userId,
        source: "video-reference-normalization",
        originalName: "video-reference.png",
        maxBytes: CREATIVE_UPLOAD_MAX_BYTES,
    });
    const url = createSignedReferenceAssetUrl(asset.token, context.publicOrigin, context.userId);
    if (!url) throw new Error("视频参考素材签名不可用，请检查站点地址和加密密钥");
    return { ...reference, url };
}

async function readReferenceImage(value: string, context: { internalOrigin: string; publicOrigin: string }) {
    const url = new URL(value, context.publicOrigin);
    const publicOrigin = new URL(context.publicOrigin).origin;
    const internal = url.origin === publicOrigin && ["/api/reference-assets/", "/api/generation-log-assets/"].some((prefix) => url.pathname.startsWith(prefix));
    const target = internal ? `${context.internalOrigin.replace(/\/+$/, "")}${url.pathname}${url.search}` : url.toString();
    const response = await (internal ? fetchInternalApi(target, { cache: "no-store" }) : fetchSafeOutbound(target, { cache: "no-store" }));
    if (!response.ok || !response.body) throw new Error(`视频参考素材读取失败（${response.status}）`);
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > CREATIVE_UPLOAD_MAX_BYTES) throw new Error("视频参考图片不能超过 20MB");
    const bytes = await readBoundedBytes(response.body);
    const mimeType = (await fileTypeFromBuffer(bytes))?.mime?.toLowerCase() || "";
    return { bytes, mimeType };
}

async function readBoundedBytes(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done) break;
            total += next.value.byteLength;
            if (total > CREATIVE_UPLOAD_MAX_BYTES) {
                await reader.cancel("Video reference exceeds upload limit").catch(() => undefined);
                throw new Error("视频参考图片不能超过 20MB");
            }
            chunks.push(next.value);
        }
    } catch (error) {
        await reader.cancel(error).catch(() => undefined);
        throw error;
    }
    if (!total) throw new Error("视频参考素材为空");
    return Buffer.concat(
        chunks.map((chunk) => Buffer.from(chunk)),
        total,
    );
}
