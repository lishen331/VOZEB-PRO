import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { configureCommercialOrder, getSchoolCommercialOrder, startCommercialOrder } from "@/lib/server/commercial-order-service";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
type PatchBody = { action?: unknown; teacherMembershipId?: unknown; classId?: unknown; participantMembershipIds?: unknown };

export async function GET(_request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        return schoolApiOk(await getSchoolCommercialOrder(user.id, (await context.params).id));
    } catch (error) {
        return schoolApiFailure(error, "读取学校商单失败");
    }
}

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const orderId = (await context.params).id;
    const parsed = await readJsonBodyResult<PatchBody>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data) || (parsed.data.action !== "configure" && parsed.data.action !== "start")) return schoolApiError(400, "商单操作无效");
    if (parsed.data.action === "configure") {
        if (typeof parsed.data.teacherMembershipId !== "string" || !parsed.data.teacherMembershipId.trim()) return schoolApiError(400, "缺少负责老师");
        if (parsed.data.classId !== undefined && typeof parsed.data.classId !== "string") return schoolApiError(400, "班级无效");
        if (!Array.isArray(parsed.data.participantMembershipIds) || parsed.data.participantMembershipIds.some((id) => typeof id !== "string" || !id.trim())) return schoolApiError(400, "参与成员无效");
    }
    try {
        return schoolApiOk(
            parsed.data.action === "start"
                ? await startCommercialOrder(user.id, orderId)
                : await configureCommercialOrder(user.id, orderId, {
                      teacherMembershipId: parsed.data.teacherMembershipId as string,
                      classId: typeof parsed.data.classId === "string" && parsed.data.classId.trim() ? parsed.data.classId : undefined,
                      participantMembershipIds: parsed.data.participantMembershipIds as string[],
                  }),
        );
    } catch (error) {
        return schoolApiFailure(error, parsed.data.action === "start" ? "开始制作失败" : "配置商单失败");
    }
}
