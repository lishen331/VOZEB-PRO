import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { deleteOfficialWorkMedia, listOfficialWorkMedia, OfficialWorkMediaServiceError, uploadOfficialWorkMedia } from "@/lib/server/official-work-media-service";
import { readRequestBodyBytes, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";
import { forbidden, unauthorized, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_UPLOAD_REQUEST_BYTES = 800 * 1024 * 1024 + 64 * 1024;

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    try {
        const params = new URL(request.url).searchParams;
        return workPublicationOk(await listOfficialWorkMedia(user.id, { page: Number(params.get("page")) || 1, pageSize: Number(params.get("pageSize")) || 20, type: params.get("type") || undefined, keyword: params.get("keyword") || undefined }));
    } catch (error) {
        return mediaError(error, "读取官方作品媒体失败");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    try {
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("multipart/form-data")) throw new OfficialWorkMediaServiceError("请使用 multipart/form-data 上传媒体");
        const bytes = await readRequestBodyBytes(request, MAX_UPLOAD_REQUEST_BYTES);
        const form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes }).formData();
        const file = form.get("file");
        if (!(file instanceof File)) throw new OfficialWorkMediaServiceError("请选择媒体文件");
        const asset = await uploadOfficialWorkMedia(user.id, file);
        await safeRecordAuditLog({ action: "admin.official-work.media.upload", actor: auditActorFromRequest(request, user), target: { type: "published_work_media", id: asset.storageKey, label: asset.originalName } });
        return workPublicationOk(asset, "媒体已上传", 201);
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.official-work.media.upload",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "published_work_media" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        return mediaError(error, "媒体上传失败");
    }
}

export async function DELETE(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    try {
        const parsed = await readJsonBodyResult<{ storageKeys?: unknown }>(request);
        if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
        const result = await deleteOfficialWorkMedia(user.id, parsed.data.storageKeys);
        await safeRecordAuditLog({ action: "admin.official-work.media.delete", actor: auditActorFromRequest(request, user), target: { type: "published_work_media" }, metadata: { storageKeys: parsed.data.storageKeys, blocked: result.blocked } });
        return workPublicationOk(result, result.blocked.length ? "部分媒体仍被作品引用" : "媒体已清理");
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.official-work.media.delete",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "published_work_media" },
            metadata: { error: error instanceof Error ? error.message : "unknown" },
        });
        return mediaError(error, "媒体清理失败");
    }
}

function mediaError(error: unknown, fallback: string) {
    if (error instanceof OfficialWorkMediaServiceError || error instanceof RequestBodyTooLargeError) {
        const status = "status" in error && typeof error.status === "number" ? error.status : 400;
        return NextResponse.json({ code: status, data: null, msg: error.message }, { status });
    }
    console.error(fallback, error);
    return NextResponse.json({ code: 500, data: null, msg: fallback }, { status: 500 });
}
