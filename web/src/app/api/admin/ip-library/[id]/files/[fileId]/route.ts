import { hasAdminPermission } from "@/lib/admin-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { deleteAdminIpFile, readAdminIpFile } from "@/lib/server/ip-library-admin-service";
import { schoolApiError, schoolApiErrorStatus, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; fileId: string }> };

export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "content.manage")) return schoolApiError(403, "当前管理员没有内容运营职责权限");
    const { id, fileId } = await context.params;
    try {
        return await readAdminIpFile(user.id, request, id, fileId);
    } catch (error) {
        return schoolApiFailure(error, "读取 IP 内容文件失败");
    }
}

export async function DELETE(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    if (!hasAdminPermission(user, "content.manage")) return schoolApiError(403, "当前管理员没有内容运营职责权限");
    const { id, fileId } = await context.params;
    try {
        await deleteAdminIpFile(user.id, id, fileId);
        await safeRecordAuditLog({ action: "admin.ip.file.delete", actor: auditActorFromRequest(request, user), target: { type: "ip_file", id: fileId }, metadata: { ipId: id } });
        return schoolApiOk({ deleted: true });
    } catch (error) {
        await safeRecordAuditLog({
            action: "admin.ip.file.delete",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "ip_file", id: fileId },
            metadata: { ipId: id, errorStatus: schoolApiErrorStatus(error) },
        });
        return schoolApiFailure(error, "删除 IP 内容文件失败");
    }
}
