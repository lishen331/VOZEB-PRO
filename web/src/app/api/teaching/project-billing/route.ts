import { getCurrentUser } from "@/lib/auth/session";
import { getSchoolProjectBillingSummary } from "@/lib/server/school-compute-billing-context";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    const surface = params.get("surface");
    const projectId = params.get("projectId");
    if ((surface !== "canvas" && surface !== "drama") || !projectId) return schoolApiError(400, "项目计费参数无效");
    try {
        return schoolApiOk(await getSchoolProjectBillingSummary(user.id, { surface, projectId, executionProfile: "production" }));
    } catch (error) {
        return schoolApiFailure(error, "读取项目计费关联失败");
    }
}
