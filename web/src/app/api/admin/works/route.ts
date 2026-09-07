import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { createOfficialWorkDraft, listWorkPublicationsForAdmin, type OfficialWorkDraftInput } from "@/lib/server/work-publication-service";
import { forbidden, unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    try {
        const params = new URL(request.url).searchParams;
        return workPublicationOk(
            await listWorkPublicationsForAdmin({
                page: Number(params.get("page")) || 1,
                pageSize: Number(params.get("pageSize")) || 20,
                status: params.get("status"),
                lifecycleStatus: params.get("lifecycleStatus"),
                origin: params.get("origin"),
                keyword: params.get("keyword"),
            }),
        );
    } catch (error) {
        return workPublicationError(error, "获取作品管理列表失败", "List admin works failed");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    const parsed = await readJsonBodyResult<OfficialWorkDraftInput>(request);
    if (!parsed.ok) return workPublicationOk(null, parsed.message, parsed.status);
    try {
        const work = await createOfficialWorkDraft(user.id, parsed.data);
        await safeRecordAuditLog({ action: "admin.official-work.create", actor: auditActorFromRequest(request, user), target: { type: "published_work", id: work.id, label: work.currentVersion?.title } });
        return workPublicationOk({ work }, "官方作品草稿已保存", 201);
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.official-work.create", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "published_work" }, metadata: { error: error instanceof Error ? error.message : "unknown" } });
        return workPublicationError(error, "保存官方作品草稿失败", "Create official work failed");
    }
}
