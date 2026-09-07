import { hasAdminPermission } from "@/lib/admin-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { relistOfficialWork } from "@/lib/server/work-publication-service";
import { forbidden, unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    const { id } = await context.params;
    try {
        const work = await relistOfficialWork(user.id, id);
        await safeRecordAuditLog({ action: "admin.official-work.relist", actor: auditActorFromRequest(request, user), target: { type: "published_work", id, label: work.currentVersion?.title } });
        return workPublicationOk({ work }, "官方作品已重新上架");
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.official-work.relist", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "published_work", id }, metadata: { error: error instanceof Error ? error.message : "unknown" } });
        return workPublicationError(error, "重新上架官方作品失败", "Relist official work failed");
    }
}
