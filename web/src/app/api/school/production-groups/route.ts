import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isProductionGroupStatus } from "@/lib/school-compute-domain";
import { createProductionGroup } from "@/lib/server/school-production-group-service";
import { listProductionGroupsForSchool } from "@/lib/server/school-production-group-service";
import { schoolApiError, schoolApiFailure, schoolApiOk, positiveInteger } from "@/lib/server/school-api-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    try {
        const status = params.get("status");
        return schoolApiOk(
            await listProductionGroupsForSchool(user.id, {
                page: Math.max(1, positiveInteger(params.get("page"), 1)),
                pageSize: Math.min(100, positiveInteger(params.get("pageSize"), 20)),
                keyword: params.get("keyword") || undefined,
                status: isProductionGroupStatus(status) ? status : undefined,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取制作小组失败");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ name?: unknown; description?: unknown; leaderMembershipId?: unknown; memberMembershipIds?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (typeof parsed.data.name !== "string" || typeof parsed.data.leaderMembershipId !== "string" || !Array.isArray(parsed.data.memberMembershipIds) || parsed.data.memberMembershipIds.some((id) => typeof id !== "string"))
        return schoolApiError(400, "制作小组参数无效");
    try {
        return schoolApiOk(
            await createProductionGroup(user.id, {
                name: parsed.data.name,
                description: typeof parsed.data.description === "string" ? parsed.data.description : undefined,
                leaderMembershipId: parsed.data.leaderMembershipId,
                memberMembershipIds: parsed.data.memberMembershipIds,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "创建制作小组失败");
    }
}
