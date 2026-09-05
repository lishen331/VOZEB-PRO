import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isProductionGroupStatus } from "@/lib/school-compute-domain";
import { linkCommercialOrderToGroup, updateProductionGroup } from "@/lib/server/school-production-group-service";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        const { getProductionGroup } = await import("@/lib/server/school-production-group-service");
        return schoolApiOk(await getProductionGroup(user.id, (await context.params).id));
    } catch (error) {
        return schoolApiFailure(error, "读取制作小组失败");
    }
}

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ action?: unknown; name?: unknown; description?: unknown; status?: unknown; orderId?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    const id = (await context.params).id;
    try {
        if (parsed.data.action === "link_order") {
            if (typeof parsed.data.orderId !== "string") return schoolApiError(400, "缺少商单编号");
            return schoolApiOk(await linkCommercialOrderToGroup(user.id, id, parsed.data.orderId));
        }
        if (parsed.data.status !== undefined && !isProductionGroupStatus(parsed.data.status)) return schoolApiError(400, "制作小组状态无效");
        return schoolApiOk(
            await updateProductionGroup(user.id, id, {
                name: typeof parsed.data.name === "string" ? parsed.data.name : undefined,
                description: typeof parsed.data.description === "string" ? parsed.data.description : undefined,
                status: isProductionGroupStatus(parsed.data.status) ? parsed.data.status : undefined,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "更新制作小组失败");
    }
}
