import { NextResponse } from "next/server";

import { forbidden, unauthorized, workPublicationError, workPublicationOk } from "@/app/api/_shared/work-publication-response";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { updateWorkPresentation } from "@/lib/server/work-governance-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return unauthorized();
    if (!hasAdminPermission(user, "content.manage")) return forbidden();
    const { id } = await context.params;
    const parsed = await readJsonBodyResult<Parameters<typeof updateWorkPresentation>[1]>(request);
    if (!parsed.ok) return NextResponse.json({ code: parsed.status, data: null, msg: parsed.message }, { status: parsed.status });
    try {
        const { work, audit } = await updateWorkPresentation(id, parsed.data);
        await safeRecordAuditLog({ action: "admin.work.presentation", actor: auditActorFromRequest(request, user), target: { type: "published_work", id }, metadata: audit });
        return workPublicationOk({ work });
    } catch (error) {
        await safeRecordAuditLog({ action: "admin.work.presentation", status: "failure", actor: auditActorFromRequest(request, user), target: { type: "published_work", id } });
        return workPublicationError(error, "更新作品展示失败", "Update work presentation failed");
    }
}
