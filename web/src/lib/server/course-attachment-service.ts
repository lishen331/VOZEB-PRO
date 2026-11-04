import { createWriteStream, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";

import type { CourseAttachment } from "@/lib/school-domain";
import { deleteLocalMediaAssetsByStorageKeys, deleteUserLocalMediaAssets } from "@/lib/server/local-media-storage";
import { canConvertToPdf, enqueuePdfConversion } from "@/lib/server/office-document-converter";
import { createSchoolDomainRepository } from "@/lib/server/school-domain-repository";
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
        // PPTX / DOCX / XLSX：转换交给后台队列，上传立刻返回，不让用户等 6~20 秒。
        // 后台转完会按 storage_key 把 preview_storage_key / preview_status 回填到资料行。
        if (canConvertToPdf(fileName)) {
            schedulePdfPreview({ sourcePath: temporaryPath, fileName, ownerUserId: input.ownerUserId, storageKey: stored.token });
            return { title: fileName, fileName, url, storageKey: stored.token, mimeType, bytes: stored.bytes, previewStatus: "pending" };
        }
        return { title: fileName, fileName, url, storageKey: stored.token, mimeType, bytes: stored.bytes, previewStatus: "none" };
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
}

/**
 * 后台排一次 PDF 预览转换，转完按 storage_key 回填到资料行。
 * 上传接口不等它：临时目录在请求结束时会删，所以先把字节读进内存再排队。
 */
function schedulePdfPreview(input: { sourcePath: string; fileName: string; ownerUserId: string; storageKey: string }) {
    let bytes: Buffer;
    try {
        bytes = readFileSync(input.sourcePath);
    } catch {
        return;
    }
    void (async () => {
        const pdf = await enqueuePdfConversion({ bytes, fileName: input.fileName });
        if (!pdf) {
            await updateCourseMaterialPreview(input.storageKey, { previewStatus: "failed" });
            return;
        }
        const directory = await mkdtemp(join(tmpdir(), "vozeb-course-preview-"));
        try {
            const previewPath = join(directory, "preview.pdf");
            writeFileSync(previewPath, pdf);
            const previewFileName = `${input.fileName.replace(/\.[^.]+$/, "")}.pdf`;
            const stored = await writePersistentAttachmentFile(previewPath, previewFileName, "application/pdf", { ownerUserId: input.ownerUserId, source: "course-attachment" });
            await updateCourseMaterialPreview(input.storageKey, { previewStorageKey: stored.token, previewStatus: "ready" });
        } catch {
            await updateCourseMaterialPreview(input.storageKey, { previewStatus: "failed" });
        } finally {
            await rm(directory, { recursive: true, force: true });
        }
    })().catch(() => undefined);
}

/** 把转换结果写回资料行；资料还没建（用户只上传没挂课时）时查不到行，忽略即可 */
async function updateCourseMaterialPreview(storageKey: string, patch: { previewStorageKey?: string; previewStatus: "ready" | "failed" }) {
    try {
        const repository = createSchoolDomainRepository();
        await repository.updateCourseMaterialPreviewByStorageKey(storageKey, patch);
    } catch {
        // 回填失败不影响上传，预览保持 pending / 降级成文件卡片
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
