import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { confirmConsumedAdvanceReturns } from "@/lib/server/school-compute-settlement-service";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string; settlementId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ advanceIds?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    const advanceIds = parsed.data.advanceIds;
    if (advanceIds !== undefined && (!Array.isArray(advanceIds) || advanceIds.some((id) => typeof id !== "string"))) return schoolApiError(400, "个人垫付编号无效");
    try {
        const params = await context.params;
        return schoolApiOk(await confirmConsumedAdvanceReturns(user.id, params.id, params.settlementId, { advanceIds: advanceIds as string[] | undefined }));
    } catch (error) {
        return schoolApiFailure(error, "确认个人垫付返还失败");
    }
}
