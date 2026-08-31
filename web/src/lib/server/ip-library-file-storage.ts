import { createHash } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, resolve, sep } from "node:path";

import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";

import type { IpAssetKind } from "@/lib/ip-library-domain";
import type { IpContentFileCreateInput, IpContentFileRecord } from "@/lib/server/database/repository-types";
import { getIpLibraryFilesDir } from "@/lib/server/data-dir";
import { createLocalMediaResponse, mediaContentDisposition } from "@/lib/server/local-media-response";
import { deleteObjects, putObjectBytes, signObjectRead } from "@/lib/server/object-storage-client";
import { assertObjectStorageConfigured, getObjectStorageRuntimeConfig } from "@/lib/server/object-storage-config";
import { createExternalStorageImagePreviewUrl } from "@/lib/server/object-storage-service";
import { SchoolServiceError } from "@/lib/server/school-access-service";

export const IP_CONTENT_FILE_MAX_BYTES: Record<IpAssetKind, number> = {
    text: 20 * 1024 * 1024,
    image: 20 * 1024 * 1024,
    audio: 30 * 1024 * 1024,
    video: 200 * 1024 * 1024,
};

type WriteInput = {
    ipId: string;
    fileId: string;
    kind: IpAssetKind;
    originalName: string;
    bytes: Buffer;
    uploadedByUserId: string;
};

const MEDIA_MIMES: Record<Exclude<IpAssetKind, "text">, ReadonlySet<string>> = {
    image: new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]),
    audio: new Set(["audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/opus", "audio/aac", "audio/flac", "audio/mp4"]),
    video: new Set(["video/mp4", "video/webm", "video/quicktime"]),
};

const EXTENSIONS_BY_MIME: Record<string, ReadonlySet<string>> = {
    "image/jpeg": new Set([".jpg", ".jpeg"]),
    "image/png": new Set([".png"]),
    "image/webp": new Set([".webp"]),
    "image/gif": new Set([".gif"]),
    "image/avif": new Set([".avif"]),
    "audio/mpeg": new Set([".mp3"]),
    "audio/wav": new Set([".wav"]),
    "audio/x-wav": new Set([".wav"]),
    "audio/ogg": new Set([".ogg", ".opus"]),
    "audio/opus": new Set([".opus"]),
    "audio/aac": new Set([".aac"]),
    "audio/flac": new Set([".flac"]),
    "audio/mp4": new Set([".m4a"]),
    "video/mp4": new Set([".mp4", ".m4v"]),
    "video/webm": new Set([".webm"]),
    "video/quicktime": new Set([".mov"]),
};

export async function writeIpContentFile(input: WriteInput): Promise<IpContentFileCreateInput> {
    const ipId = safePathSegment(input.ipId, "IP 标识无效");
    const fileId = safePathSegment(input.fileId, "文件标识无效");
    const originalName = safeOriginalName(input.originalName);
    if (!input.bytes.length) throw new SchoolServiceError(400, "IP 内容文件不能为空");
    if (input.bytes.length > IP_CONTENT_FILE_MAX_BYTES[input.kind]) throw new SchoolServiceError(413, "IP 内容文件超过允许大小");

    const inspected = await inspectFile(input.kind, originalName, input.bytes);
    const storageKey = `${ipId}/${fileId}/original${inspected.extension}`;
    const config = await getObjectStorageRuntimeConfig();
    const common = {
        id: fileId,
        ipId,
        kind: input.kind,
        originalName,
        extension: inspected.extension,
        mimeType: inspected.mimeType,
        byteSize: input.bytes.length,
        sha256: createHash("sha256").update(input.bytes).digest("hex"),
        storageKey,
        extractedText: inspected.extractedText,
        metadata: inspected.metadata,
        status: "ready" as const,
        uploadedByUserId: input.uploadedByUserId,
    };
    if (config.enabled) {
        assertObjectStorageConfigured(config);
        const objectKey = `${config.prefix}/ip-library/${storageKey}`;
        await putObjectBytes(config, { key: objectKey, bytes: input.bytes, contentType: inspected.mimeType, metadata: { ipid: ipId, fileid: fileId } });
        return { ...common, storageProvider: "object", externalStorageId: config.id, externalObjectKey: objectKey };
    }

    const filePath = localFilePath(storageKey);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.bytes, { flag: "wx" }).catch((error) => {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new SchoolServiceError(409, "IP 内容文件已存在");
        throw error;
    });
    return { ...common, storageProvider: "local" };
}

export async function readIpContentFile(request: Request, record: IpContentFileRecord | IpContentFileCreateInput) {
    if (record.status !== "ready") return null;
    const download = new URL(request.url).searchParams.get("download") === "original";
    if (record.storageProvider === "local") {
        return createLocalMediaResponse(request, localFilePath(record.storageKey), record.mimeType, {
            "Cache-Control": "private, no-store",
            "Content-Disposition": mediaContentDisposition("inline", record.originalName, record.mimeType),
        });
    }
    if (!record.externalObjectKey) return null;
    let url: string | null = null;
    if (record.kind === "image" && !download) url = await createExternalStorageImagePreviewUrl(record.externalObjectKey, new URL(request.url).searchParams.get("width"));
    if (!url) {
        const config = await getObjectStorageRuntimeConfig();
        assertObjectStorageConfigured(config);
        if (record.externalStorageId && record.externalStorageId !== config.id) return null;
        url = await signObjectRead(config, {
            key: record.externalObjectKey,
            contentType: record.mimeType,
            contentDisposition: mediaContentDisposition(download ? "attachment" : "inline", record.originalName, record.mimeType, download ? record.storageKey : ""),
        });
    }
    return Response.redirect(url, 302);
}

export async function deleteStoredIpContentFile(record: IpContentFileRecord | IpContentFileCreateInput) {
    if (record.storageProvider === "object") {
        if (!record.externalObjectKey) return;
        const config = await getObjectStorageRuntimeConfig();
        assertObjectStorageConfigured(config);
        if (record.externalStorageId && record.externalStorageId !== config.id) throw new SchoolServiceError(409, "IP 内容文件使用了其他对象存储配置");
        await deleteObjects(config, [record.externalObjectKey]);
        return;
    }
    await unlink(localFilePath(record.storageKey)).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    });
}

async function inspectFile(kind: IpAssetKind, originalName: string, bytes: Buffer) {
    const originalExtension = extname(originalName).toLowerCase();
    if (kind === "text") {
        if (originalExtension !== ".txt" && originalExtension !== ".md") throw new SchoolServiceError(415, "文本内容仅支持 TXT 或 Markdown 文件");
        let extractedText: string;
        try {
            extractedText = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
        } catch {
            throw new SchoolServiceError(415, "文本文件必须使用 UTF-8 编码");
        }
        return { extension: originalExtension, mimeType: originalExtension === ".md" ? "text/markdown; charset=utf-8" : "text/plain; charset=utf-8", extractedText, metadata: {} };
    }

    const detected = await fileTypeFromBuffer(bytes);
    if (!detected || !MEDIA_MIMES[kind].has(detected.mime) || !EXTENSIONS_BY_MIME[detected.mime]?.has(originalExtension)) throw new SchoolServiceError(415, "文件真实格式、扩展名或内容类型不匹配");
    if (kind !== "image") return { extension: originalExtension, mimeType: detected.mime, metadata: {} };
    try {
        const metadata = await sharp(bytes, { failOn: "error" }).metadata();
        if (!metadata.width || !metadata.height) throw new Error("missing dimensions");
        return { extension: originalExtension, mimeType: detected.mime, metadata: { width: metadata.width, height: metadata.height } };
    } catch {
        throw new SchoolServiceError(415, "图片内容无法解析");
    }
}

function localFilePath(storageKey: string) {
    const root = resolve(getIpLibraryFilesDir());
    const filePath = resolve(root, storageKey.replace(/\\/g, "/"));
    if (filePath === root || !filePath.startsWith(`${root}${sep}`)) throw new SchoolServiceError(400, "IP 文件路径无效");
    return filePath;
}

function safePathSegment(value: string, message: string) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!/^[a-zA-Z0-9_-]+$/.test(text)) throw new SchoolServiceError(400, message);
    return text;
}

function safeOriginalName(value: string) {
    const name = basename((value || "").replace(/\\/g, "/"))
        .replace(/[\u0000-\u001f\u007f]/g, "-")
        .trim()
        .slice(0, 240);
    if (!name) throw new SchoolServiceError(400, "文件名无效");
    return name;
}
