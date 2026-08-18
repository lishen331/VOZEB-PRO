import { forbidden, unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { PublicWorkProcessServiceError, setPublishedWorkPullFilm } from "@/lib/server/public-work-process-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    const { id } = await context.params;
    let enabled: unknown;
    try {
        const body = await readJsonBody<{ enabled?: unknown } | null>(request);
        enabled = body && typeof body === "object" ? body.enabled : undefined;
        if (typeof enabled !== "boolean") throw new PublicWorkProcessServiceError("拉片项目状态无效");
        const result = await setPublishedWorkPullFilm(user.id, id, enabled);
        await safeRecordAuditLog({
            action: enabled ? "admin.work.pull-film.enable" : "admin.work.pull-film.disable",
            actor: auditActorFromRequest(request, user),
            target: { type: "published_work", id },
            metadata: { enabled, processVersionId: result.processVersionId },
        });
        return workPublicationOk(result, enabled ? "作品已设为拉片项目" : "作品已取消拉片项目");
    } catch (error) {
        await safeRecordAuditLog({
            action: enabled === true ? "admin.work.pull-film.enable" : "admin.work.pull-film.disable",
            status: "failure",
            actor: auditActorFromRequest(request, user),
            target: { type: "published_work", id },
            metadata: { enabled: enabled === true, error: error instanceof Error ? error.message : "unknown" },
        });
        return workPublicationError(error, "更新拉片项目状态失败", "Update work pull-film state failed");
    }
}
