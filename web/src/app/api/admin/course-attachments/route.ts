import { NextResponse } from "next/server";

import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { CourseAttachmentServiceError, deleteCourseAttachments, storeCourseAttachment } from "@/lib/server/course-attachment-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, null, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return response(403, null, "当前管理员没有产教运营职责权限");
    if (!request.body) return response(400, null, "缺少课程附件");
    let fileName = "";
    try {
        fileName = decodeURIComponent(request.headers.get("x-file-name") || "");
    } catch {
        return response(400, null, "课程附件名称无效");
    }
    const contentLengthHeader = request.headers.get("content-length");
    const contentLength = contentLengthHeader === null ? undefined : Number(contentLengthHeader);
    try {
        const attachment = await storeCourseAttachment({
            ownerUserId: user.id,
            fileName,
            declaredMimeType: request.headers.get("content-type") || "",
            body: request.body,
            contentLength,
        });
        await safeRecordAuditLog({
            action: "admin.course.attachment.upload",
            actor: auditActorFromRequest(request, user),
            target: { type: "course_attachment", id: attachment.storageKey },
            metadata: { bytes: attachment.bytes, mimeType: attachment.mimeType },
        });
        return response(0, attachment, "课程附件已上传");
    } catch (error) {
        const status = error instanceof CourseAttachmentServiceError ? error.status : 500;
        await safeRecordAuditLog({
            action: "admin.course.attachment.upload",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            metadata: { errorStatus: status },
        });
        return response(status, null, status === 500 ? "课程附件上传失败" : error instanceof Error ? error.message : "课程附件上传失败");
    }
}

export async function DELETE(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, null, "请先登录");
    if (!hasAdminPermission(user, "education.manage")) return response(403, null, "当前管理员没有产教运营职责权限");
    const parsed = await readJsonBodyResult<{ storageKeys?: unknown }>(request);
    if (!parsed.ok) return response(parsed.status, null, parsed.message);
    const storageKeys = Array.isArray(parsed.data.storageKeys) ? parsed.data.storageKeys.filter((value): value is string => typeof value === "string") : [];
    if (!storageKeys.length) return response(400, null, "请选择要清理的课程附件");
    try {
        const result = await deleteCourseAttachments(user.id, storageKeys);
        await safeRecordAuditLog({
            action: "admin.course.attachment.delete",
            actor: auditActorFromRequest(request, user),
            target: { type: "course_attachment", id: "batch" },
            metadata: { requested: storageKeys.length, deleted: result.deletedFiles, blocked: result.blocked.length },
        });
        return response(0, result, result.blocked.length ? "仍被课程引用的附件已保留" : "课程附件已清理");
    } catch {
        return response(500, null, "课程附件清理失败");
    }
}

function response<T>(code: number, data: T, msg: string) {
    return NextResponse.json({ code, data, msg }, { status: code === 0 ? 200 : code });
}
