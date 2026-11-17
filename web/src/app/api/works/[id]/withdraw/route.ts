import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { withdrawWorkPublication } from "@/lib/server/work-publication-service";
import { unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/**
 * 撤回审核：把当前版本从「审核中」退回「草稿」，作者可以继续修改后再提交。
 * 与下架（revoke）不同，撤回不影响已经上线的旧版本。
 */
export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    const { id } = await context.params;
    try {
        const work = await withdrawWorkPublication(user.id, id);
        await safeRecordAuditLog({ action: "work.publication.withdraw", actor: auditActorFromRequest(request, user), target: { type: "published_work", id: work.id, label: work.currentVersion?.title } });
        return workPublicationOk({ work }, "已撤回审核，可以继续修改");
    } catch (error) {
        await safeRecordAuditLog({ action: "work.publication.withdraw", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "published_work", id }, metadata: { error: error instanceof Error ? error.message : "unknown" } });
        return workPublicationError(error, "撤回审核失败", "Withdraw work publication failed");
    }
}
