import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { UpdateSchoolInput } from "@/lib/school-domain";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { getSchoolProfile, updateSchoolProfile } from "@/lib/server/school-tenant-service";

export const runtime = "nodejs";

export async function GET() {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        return schoolApiOk(await getSchoolProfile(user.id));
    } catch (error) {
        return schoolApiFailure(error, "读取学校资料失败");
    }
}

export async function PATCH(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<Pick<UpdateSchoolInput, "name" | "profile">>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    try {
        return schoolApiOk(await updateSchoolProfile(user.id, parsed.data));
    } catch (error) {
        return schoolApiFailure(error, "更新学校资料失败");
    }
}
