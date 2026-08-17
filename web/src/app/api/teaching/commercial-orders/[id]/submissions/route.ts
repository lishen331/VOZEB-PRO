import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { configureCommercialOrderParticipants, listCommercialOrderSubmissions, submitCommercialOrderDelivery, submitCommercialOrderWork } from "@/lib/server/commercial-order-service";
import { isSchoolApiObject, positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        const params = new URL(request.url).searchParams;
        return schoolApiOk(
            await listCommercialOrderSubmissions(user.id, (await context.params).id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: positiveInteger(params.get("pageSize"), 20),
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取商单提交失败");
    }
}

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ action?: unknown; note?: unknown; references?: unknown; participantMembershipIds?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data) || (parsed.data.action !== "candidate" && parsed.data.action !== "delivery" && parsed.data.action !== "participants")) return schoolApiError(400, "提交类型无效");
    if (parsed.data.action === "participants" && (!Array.isArray(parsed.data.participantMembershipIds) || parsed.data.participantMembershipIds.some((id) => typeof id !== "string" || !id.trim()))) {
        return schoolApiError(400, "参与学生无效");
    }
    try {
        if (parsed.data.action === "participants") {
            return schoolApiOk(await configureCommercialOrderParticipants(user.id, (await context.params).id, parsed.data.participantMembershipIds as string[]));
        }
        const input = { note: typeof parsed.data.note === "string" ? parsed.data.note : "", references: parsed.data.references };
        return schoolApiOk(parsed.data.action === "delivery" ? await submitCommercialOrderDelivery(user.id, (await context.params).id, input) : await submitCommercialOrderWork(user.id, (await context.params).id, input));
    } catch (error) {
        return schoolApiFailure(error, parsed.data.action === "delivery" ? "提交正式交付失败" : parsed.data.action === "participants" ? "安排参与学生失败" : "提交候选成果失败");
    }
}
