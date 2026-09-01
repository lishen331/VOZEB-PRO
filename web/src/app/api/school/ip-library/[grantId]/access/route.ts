import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { auditActorFromRequest, safeRecordAuditLog } from "@/lib/server/audit-log-store";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { updateSchoolIpMemberAccess } from "@/lib/server/school-ip-library-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ grantId: string }> };

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ enabled?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (typeof parsed.data.enabled !== "boolean") return schoolApiError(400, "校内开放状态无效");
    try {
        const grantId = (await context.params).grantId;
        const result = await updateSchoolIpMemberAccess(user.id, grantId, parsed.data.enabled);
        await safeRecordAuditLog({
            action: "school.ip.member_access.update",
            actor: auditActorFromRequest(request, user),
            target: { type: "ip_school_grant", id: grantId },
            metadata: { enabled: parsed.data.enabled },
        });
        return schoolApiOk(result);
    } catch (error) {
        return schoolApiFailure(error, "更新学校 IP 开放状态失败");
    }
}
