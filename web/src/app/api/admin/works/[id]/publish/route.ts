import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { publishOfficialWork } from "@/lib/server/work-publication-service";
import { forbidden, unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    const { id } = await context.params;
    const parsed = await readJsonBodyResult<{ versionId?: unknown }>(request);
    if (!parsed.ok) return workPublicationOk(null, parsed.message, parsed.status);
    try {
        const work = await publishOfficialWork({ adminUserId: user.id, workId: id, versionId: parsed.data.versionId });
        await safeRecordAuditLog({ action: "admin.official-work.publish", actor: auditActorFromRequest(request, user), target: { type: "published_work", id, label: work.currentVersion?.title } });
        return workPublicationOk({ work }, "官方作品已发布");
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.official-work.publish", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "published_work", id }, metadata: { error: error instanceof Error ? error.message : "unknown" } });
        return workPublicationError(error, "发布官方作品失败", "Publish official work failed");
    }
}
