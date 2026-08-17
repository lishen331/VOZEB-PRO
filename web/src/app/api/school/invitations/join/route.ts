import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { joinSchoolByInvite } from "@/lib/server/school-member-provisioning-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ code?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求参数无效");
    try {
        return schoolApiOk(await joinSchoolByInvite(user.id, typeof parsed.data.code === "string" ? parsed.data.code : ""));
    } catch (error) {
        return schoolApiFailure(error, "加入学校失败");
    }
}
