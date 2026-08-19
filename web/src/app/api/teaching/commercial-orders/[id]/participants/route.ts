import { getCurrentUser } from "@/lib/auth/session";
import { listCommercialOrderParticipantCandidates } from "@/lib/server/commercial-order-service";
import { positiveInteger, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    try {
        return schoolApiOk(
            await listCommercialOrderParticipantCandidates(user.id, (await context.params).id, {
                page: positiveInteger(params.get("page"), 1),
                pageSize: positiveInteger(params.get("pageSize"), 20),
                keyword: params.get("keyword") || undefined,
            }),
        );
    } catch (error) {
        return schoolApiFailure(error, "读取参与学生候选失败");
    }
}
