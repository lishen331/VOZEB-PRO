import { getCurrentUser } from "@/lib/auth/session";
import { getSchoolContextForUser } from "@/lib/server/school-access-service";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        return schoolApiOk(await getSchoolContextForUser(user.id));
    } catch (error) {
        return schoolApiFailure(error, "读取学校身份失败");
    }
}
