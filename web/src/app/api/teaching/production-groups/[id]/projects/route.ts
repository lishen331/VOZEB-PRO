import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { linkProjectToProductionGroup, unlinkProjectFromProductionGroup } from "@/lib/server/school-production-group-service";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ orderId?: unknown; projectType?: unknown; projectId?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (typeof parsed.data.orderId !== "string" || (parsed.data.projectType !== "canvas" && parsed.data.projectType !== "drama") || typeof parsed.data.projectId !== "string") return schoolApiError(400, "项目关联参数无效");
    try {
        return schoolApiOk(await linkProjectToProductionGroup(user.id, (await context.params).id, { orderId: parsed.data.orderId, projectType: parsed.data.projectType, projectId: parsed.data.projectId }));
    } catch (error) {
        return schoolApiFailure(error, "关联制作项目失败");
    }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ linkId?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (typeof parsed.data.linkId !== "string") return schoolApiError(400, "缺少项目关联编号");
    try {
        return schoolApiOk(await unlinkProjectFromProductionGroup(user.id, (await context.params).id, parsed.data.linkId));
    } catch (error) {
        return schoolApiFailure(error, "解除项目关联失败");
    }
}
