import { getCurrentUser } from "@/lib/auth/session";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { getCurrentSchoolComputePool } from "@/lib/server/school-compute-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        return schoolApiOk(await getCurrentSchoolComputePool(user.id));
    } catch (error) {
        return schoolApiFailure(error, "读取学校算力池失败");
    }
}
