import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { replaceProductionGroupMembers } from "@/lib/server/school-production-group-service";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ leaderMembershipId?: unknown; memberMembershipIds?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (typeof parsed.data.leaderMembershipId !== "string" || !Array.isArray(parsed.data.memberMembershipIds) || parsed.data.memberMembershipIds.some((id) => typeof id !== "string")) return schoolApiError(400, "成员参数无效");
    try {
        return schoolApiOk(await replaceProductionGroupMembers(user.id, (await context.params).id, { leaderMembershipId: parsed.data.leaderMembershipId, memberMembershipIds: parsed.data.memberMembershipIds }));
    } catch (error) {
        return schoolApiFailure(error, "更新制作小组成员失败");
    }
}
