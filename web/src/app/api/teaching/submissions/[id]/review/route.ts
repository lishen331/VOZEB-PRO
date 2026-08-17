import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { reviewTeachingSubmission } from "@/lib/server/school-course-service";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ status?: unknown; feedback?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    if ((parsed.data.status !== "reviewed" && parsed.data.status !== "revision_required") || typeof parsed.data.feedback !== "string") return schoolApiError(400, "批改参数无效");
    try {
        return schoolApiOk(await reviewTeachingSubmission(user.id, (await context.params).id, { status: parsed.data.status, feedback: parsed.data.feedback }));
    } catch (error) {
        return schoolApiFailure(error, "批改提交失败");
    }
}
