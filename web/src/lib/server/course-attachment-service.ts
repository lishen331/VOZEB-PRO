import { createWriteStream, writeFileSync } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import type { CourseAttachment } from "@/lib/school-domain";
import { deleteLocalMediaAssetsByStorageKeys, deleteUserLocalMediaAssets } from "@/lib/server/local-media-storage";
import { canConvertToPdf, convertDocumentToPdf } from "@/lib/server/office-document-converter";
import { writePersistentAttachmentFile } from "@/lib/server/reference-asset-store";

const COURSE_ATTACHMENT_MIME_TYPES: Record<string, string> = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".zip": "application/zip",
};

export async function storeCourseAttachment(input: { ownerUserId: string; fileName: string; declaredMimeType: string; body: ReadableStream<Uint8Array>; contentLength?: number }): Promise<CourseAttachment> {
    const fileName = normalizeFileName(input.fileName);
    const extension = fileName.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] || "";
    const mimeType = COURSE_ATTACHMENT_MIME_TYPES[extension];
    if (!mimeType) throw new CourseAttachmentServiceError("不支持该课程附件格式", 400);
    const declaredMimeType = input.declaredMimeType.split(";", 1)[0]?.trim().toLowerCase() || "";
    if (declaredMimeType && declaredMimeType !== "application/octet-stream" && declaredMimeType !== mimeType) throw new CourseAttachmentServiceError("课程附件类型与文件扩展名不匹配", 400);
    if (!input.ownerUserId.trim()) throw new CourseAttachmentServiceError("课程附件缺少用户归属", 400);
    if (input.contentLength !== undefined && (!Number.isSafeInteger(input.contentLength) || input.contentLength <= 0)) throw new CourseAttachmentServiceError("课程附件为空", 400);

    const directory = await mkdtemp(join(tmpdir(), "vozeb-course-attachment-"));
    // 临时文件保留原扩展名：LibreOffice 靠扩展名判断类型，没有扩展名转不出 PDF
    const temporaryPath = join(directory, `upload${extension}`);
    try {
        await pipeline(Readable.fromWeb(input.body as unknown as NodeReadableStream), createWriteStream(temporaryPath, { flags: "wx" }));
        const info = await stat(temporaryPath);
        if (!info.isFile() || info.size <= 0) throw new CourseAttachmentServiceError("课程附件为空", 400);
        if (input.contentLength !== undefined && info.size !== input.contentLength) throw new CourseAttachmentServiceError("课程附件上传不完整", 400);
        const stored = await writePersistentAttachmentFile(temporaryPath, fileName, mimeType, { ownerUserId: input.ownerUserId, source: "course-attachment" });
        const url = `/api/reference-assets/${stored.token
            .split("/")
            .map((part) => encodeURIComponent(part))
            .join("/")}`;
        // PPTX / DOCX / XLSX：另存一份 PDF 预览版，平台内预览器才翻得动页
        const preview = await storePdfPreview({ temporaryPath, fileName, ownerUserId: input.ownerUserId, directory });
        return { title: fileName, fileName, url, storageKey: stored.token, mimeType, bytes: stored.bytes, ...preview };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

/**
 * 生成 PDF 预览版并落盘。转不出来（服务器没装 LibreOffice / 文件本身有问题）时返回空对象，
 * 上传照常成功，预览由调用方降级成原来的文件卡片。
 */
async function storePdfPreview(input: { temporaryPath: string; fileName: string; ownerUserId: string; directory: string }): Promise<{ previewStorageKey?: string; previewUrl?: string; previewBytes?: number }> {
    if (!canConvertToPdf(input.fileName)) return {};
    const bytes = convertDocumentToPdf(input.temporaryPath, input.directory);
    if (!bytes) return {};
    const previewFileName = `${input.fileName.replace(/\.[^.]+$/, "")}.pdf`;
    const previewPath = join(input.directory, "preview.pdf");
    try {
        writeFileSync(previewPath, bytes);
        const stored = await writePersistentAttachmentFile(previewPath, previewFileName, "application/pdf", { ownerUserId: input.ownerUserId, source: "course-attachment" });
        const previewUrl = `/api/reference-assets/${stored.token
            .split("/")
            .map((part) => encodeURIComponent(part))
            .join("/")}`;
        return { previewStorageKey: stored.token, previewUrl, previewBytes: stored.bytes };
    } catch {
        return {};
    }
}

export function deleteCourseAttachments(ownerUserId: string, storageKeys: string[]) {
    const keys = Array.from(new Set(storageKeys.map((value) => value.trim()).filter(Boolean)));
    return deleteUserLocalMediaAssets(ownerUserId, keys);
}

/** Delete course-owned files only after the course transaction has committed. */
export async function cleanupDeletedCourseMaterials(storageKeys: string[]) {
    const keys = Array.from(new Set(storageKeys.map((value) => value.trim()).filter(Boolean)));
    if (!keys.length) return { deletedFiles: 0, deletedBytes: 0, skippedShared: 0, failed: [] as string[] };
    try {
        const result = await deleteLocalMediaAssetsByStorageKeys(keys, "reference");
        return {
            deletedFiles: result.deletedFiles,
            deletedBytes: result.deletedBytes,
            skippedShared: result.blocked.length,
            failed: result.blocked.map((item) => item.storageKey),
        };
    } catch {
        return { deletedFiles: 0, deletedBytes: 0, skippedShared: 0, failed: keys };
    }
}

function normalizeFileName(value: string) {
    const normalized = value.trim();
    if (!normalized || normalized.length > 260 || normalized.includes("\0") || normalized.includes("/") || normalized.includes("\\") || basename(normalized) !== normalized) {
        throw new CourseAttachmentServiceError("课程附件名称无效", 400);
    }
    return normalized;
}

export class CourseAttachmentServiceError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}
