import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { CourseAttachmentServiceError, deleteCourseAttachments, storeCourseAttachment } from "@/lib/server/course-attachment-service";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requireActiveSchoolContext, SchoolServiceError } from "@/lib/server/school-access-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, null, "请先登录");
    try {
        const context = await requireActiveSchoolContext(user.id);
        if (context.membership.role !== "teacher") return response(403, null, "只有学校老师可以上传课程资料");
        if (!request.body) return response(400, null, "缺少课程资料");
        let fileName = "";
        try {
            fileName = decodeURIComponent(request.headers.get("x-file-name") || "");
        } catch {
            return response(400, null, "课程资料名称无效");
        }
        const lengthHeader = request.headers.get("content-length");
        const contentLength = lengthHeader === null ? undefined : Number(lengthHeader);
        return response(
            0,
            await storeCourseAttachment({
                ownerUserId: user.id,
                fileName,
                declaredMimeType: request.headers.get("content-type") || "",
                body: request.body,
                contentLength,
            }),
            "课程资料已上传",
        );
    } catch (error) {
        const status = error instanceof CourseAttachmentServiceError || error instanceof SchoolServiceError ? error.status : 500;
        return response(status, null, status === 500 ? "课程资料上传失败" : error instanceof Error ? error.message : "课程资料上传失败");
    }
}

export async function DELETE(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, null, "请先登录");
    try {
        const context = await requireActiveSchoolContext(user.id);
        if (context.membership.role !== "teacher") return response(403, null, "只有学校老师可以清理课程资料");
        const parsed = await readJsonBodyResult<{ storageKeys?: unknown }>(request);
        if (!parsed.ok) return response(parsed.status, null, parsed.message);
        const storageKeys = Array.isArray(parsed.data.storageKeys) ? parsed.data.storageKeys.filter((value): value is string => typeof value === "string") : [];
        if (!storageKeys.length) return response(400, null, "请选择要清理的课程资料");
        return response(0, await deleteCourseAttachments(user.id, storageKeys), "课程资料已清理");
    } catch (error) {
        const status = error instanceof SchoolServiceError ? error.status : 500;
        return response(status, null, status === 500 ? "课程资料清理失败" : error instanceof Error ? error.message : "课程资料清理失败");
    }
}

function response<T>(code: number, data: T, msg: string) {
    return NextResponse.json({ code, data, msg }, { status: code === 0 ? 200 : code });
}
