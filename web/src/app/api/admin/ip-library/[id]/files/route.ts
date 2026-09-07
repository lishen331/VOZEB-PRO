import { hasAdminPermission } from "@/lib/admin-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { IP_CONTENT_FILE_MAX_BYTES } from "@/lib/server/ip-library-file-storage";
import { listAdminIpFiles, uploadAdminIpFile } from "@/lib/server/ip-library-admin-service";
import { readRequestBodyBytes, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";
import { schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_MULTIPART_BYTES = IP_CONTENT_FILE_MAX_BYTES.video + 64 * 1024;
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "content.manage")) return schoolApiError(403, "当前管理员没有内容运营职责权限");
    try {
        return schoolApiOk(await listAdminIpFiles(user.id, (await context.params).id, new URL(request.url).searchParams.get("subIpId") || undefined));
    } catch (error) {
        return schoolApiFailure(error, "读取 IP 内容文件失败");
    }
}

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "content.manage")) return schoolApiError(403, "当前管理员没有内容运营职责权限");
    const ipId = (await context.params).id;
    try {
        const contentType = request.headers.get("content-type") || "";
        if (!contentType.toLowerCase().includes("multipart/form-data")) return schoolApiError(400, "请使用 multipart/form-data 上传文件");
        const bytes = await readRequestBodyBytes(request, MAX_MULTIPART_BYTES);
        const form = await new Request(request.url, { method: "POST", headers: { "content-type": contentType }, body: bytes }).formData();
        const file = form.get("file");
        if (!(file instanceof File) || !file.size) return schoolApiError(400, "请选择要上传的文件");
        const subIpId = form.get("subIpId");
        if (typeof subIpId !== "string") return schoolApiError(400, "请选择子 IP");
        const record = await uploadAdminIpFile(user.id, ipId, subIpId, form.get("kind"), file);
        await safeRecordAuditLog({
            action: "admin.ip.file.upload",
            actor: auditActorFromRequest(request, user),
            target: { type: "ip_file", id: record.id },
            metadata: { ipId, subIpId, kind: record.kind, status: record.status },
        });
        return schoolApiOk(record);
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.ip.file.upload",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "ip", id: ipId },
            metadata: { errorStatus: error instanceof RequestBodyTooLargeError ? error.status : schoolApiErrorStatus(error) },
        });
        return schoolApiFailure(error, "上传 IP 内容文件失败");
    }
}
