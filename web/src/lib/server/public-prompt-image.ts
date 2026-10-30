import sharp from "sharp";

import { normalizeImagePreviewWidth } from "@/lib/media-image-variant";
import { getOrCreateCachedImageVariant } from "@/lib/server/media-image-variant-cache";
import { getObjectBytes, isMissingObjectError, objectStorageErrorMessage, putObjectBytes } from "@/lib/server/object-storage-client";
import { getObjectStorageRuntimeConfig, type ObjectStorageRuntimeConfig } from "@/lib/server/object-storage-config";
import { fetchSafeOutbound } from "@/lib/server/safe-outbound-fetch";

const REPOSITORY = "tigerowo/awesome-gpt-image-2-prompts";
const COMMIT = "60e9c65baecfd6d6d51ac4e4d87f146af834bb64";
const MAX_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_INPUT_PIXELS = 48_000_000;
const SAFE_IMAGE_PATH = /^images\/[a-z0-9_-]+_case\d+\/[a-z0-9_-]+\.(?:jpe?g|png|webp)$/i;

export function normalizePublicPromptImagePath(value: string | null) {
    const imagePath = (value || "").trim();
    return SAFE_IMAGE_PATH.test(imagePath) ? imagePath : "";
}

export async function createPublicPromptImage(pathValue: string | null, widthValue: string | null) {
    const imagePath = normalizePublicPromptImagePath(pathValue);
    if (!imagePath) return null;
    const width = normalizeImagePreviewWidth(widthValue, 640);
    return getOrCreateCachedImageVariant(`prompt:${COMMIT}:${imagePath}:${width}`, async () => {
        const source = await readSourceImage(imagePath);
        return sharp(source, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).rotate().resize({ width, withoutEnlargement: true, fit: "inside" }).webp({ quality: 82, effort: 4 }).toBuffer();
    });
}

export function promptImageObjectKey(prefix: string, imagePath: string) {
    return `${prefix ? `${prefix}/` : ""}prompt-images/${COMMIT}/${imagePath}`;
}

export async function fetchPromptImageFromGitHub(imagePath: string) {
    const response = await fetchSafeOutbound(`https://raw.githubusercontent.com/${REPOSITORY}/${COMMIT}/${imagePath}`, {
        headers: { Accept: "image/avif,image/webp,image/png,image/jpeg", "User-Agent": "VOZEB-PRO prompt image proxy" },
        cache: "force-cache",
        signal: AbortSignal.timeout(15_000),
    });
    const contentType = response.headers.get("content-type")?.toLowerCase() || "";
    if (!response.ok || !response.body || !contentType.startsWith("image/")) throw new Error(`上游提示词图片不可用：HTTP ${response.status}`);
    const declaredBytes = Number(response.headers.get("content-length") || 0);
    if (Number.isFinite(declaredBytes) && declaredBytes > MAX_SOURCE_BYTES) throw new Error("上游提示词图片超过大小限制");
    return { bytes: await readLimitedBody(response.body), contentType };
}

async function readSourceImage(imagePath: string) {
    const config = await getObjectStorageRuntimeConfig();
    if (!config.enabled) return (await fetchPromptImageFromGitHub(imagePath)).bytes;
    const key = promptImageObjectKey(config.prefix, imagePath);
    let writeBack = true;
    try {
        const stored = await getObjectBytes(config, key);
        if (stored.length <= MAX_SOURCE_BYTES) return stored;
        console.warn("Prompt image in object storage exceeds size limit", key);
    } catch (error) {
        if (!isMissingObjectError(error)) {
            writeBack = false;
            console.warn("Prompt image object storage read failed", key, objectStorageErrorMessage(error));
        }
    }
    const fetched = await fetchPromptImageFromGitHub(imagePath);
    if (writeBack) await writePromptImage(config, key, fetched);
    return fetched.bytes;
}

async function writePromptImage(config: ObjectStorageRuntimeConfig, key: string, image: { bytes: Buffer; contentType: string }) {
    try {
        await putObjectBytes(config, { key, bytes: image.bytes, contentType: image.contentType });
    } catch (error) {
        console.warn("Prompt image object storage write failed", key, objectStorageErrorMessage(error));
    }
}

export function createUnavailablePublicPromptImage(widthValue: string | null) {
    const width = normalizeImagePreviewWidth(widthValue, 640);
    return sharp({ create: { width, height: Math.round((width * 9) / 16), channels: 3, background: "#d8e2e1" } })
        .webp({ quality: 82, effort: 4 })
        .toBuffer();
}

async function readLimitedBody(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_SOURCE_BYTES) {
            await reader.cancel("Prompt image is too large");
            throw new Error("上游提示词图片超过大小限制");
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}
