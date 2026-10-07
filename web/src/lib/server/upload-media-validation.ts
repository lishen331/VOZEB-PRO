import { fileTypeFromBuffer } from "file-type";

import { isCreativeUploadMimeType } from "@/lib/creative-upload";

// A2: 服务端专用的上传媒体校验。放在这里而非 creative-upload.ts，是因为后者
// 前后端同构共享，而 fileTypeFromBuffer 只能在服务端用，塞进去会污染客户端包。
// 见 docs/plans/2026-09-20-capacity-phase1-fix-implementation.zh-CN.md 步骤 2。

export type UploadMediaKind = "image" | "video" | "audio";

export class UploadMediaValidationError extends Error {
    constructor(message = "参考素材格式不正确") {
        super(message);
        this.name = "UploadMediaValidationError";
    }
}

/**
 * 以真实字节嗅探为准校验上传内容，不采信调用方声明的类型。
 *
 * 规则（对应实施文档步骤 2）：
 * 1. 一律先做字节嗅探。
 * 2. 嗅探成功：归一化后必须在 CREATIVE_UPLOAD_MIME_TYPES 白名单内、且前缀匹配
 *    expectedType。以嗅探结果为最终 mimeType，不采信声明值。
 * 3. 嗅探失败：直接拒绝，不回退信任声明类型。当前白名单里每种格式都有 magic
 *    bytes，回退分支对合法上传毫无作用，只对伪装上传有作用。
 *
 * @returns 归一化后的规范 mimeType（供落盘扩展名与出站 Content-Type 对齐用）。
 * @throws UploadMediaValidationError 嗅探失败或类型不匹配。
 */
export async function validateUploadBytes(bytes: Buffer, expectedType: UploadMediaKind): Promise<{ mimeType: string }> {
    const sniffed = (await fileTypeFromBuffer(bytes))?.mime;
    if (!sniffed) throw new UploadMediaValidationError();
    const mimeType = normalizeSniffedMime(sniffed);
    if (!isCreativeUploadMimeType(mimeType) || !mimeType.startsWith(`${expectedType}/`)) throw new UploadMediaValidationError();
    return { mimeType };
}

// file-type 的输出与白名单不总是逐字一致，这些归一化是"零回归"验收所必需的：
// - opus 嗅探为 "audio/ogg; codecs=opus"，须剥掉参数后缀；
// - ogg 容器嗅探为 "application/ogg"，须映射到 audio/ogg（official-work-media-service
//   已用同样的特判）；
// - jpg 归一到 jpeg，与 reference-asset-store 的 normalizeMimeType 保持一致。
function normalizeSniffedMime(value: string) {
    const base = value.split(";", 1)[0]?.trim().toLowerCase() || "";
    if (base === "application/ogg") return "audio/ogg";
    if (base === "image/jpg") return "image/jpeg";
    return base;
}
