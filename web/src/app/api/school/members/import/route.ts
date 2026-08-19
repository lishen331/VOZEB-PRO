import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { SchoolMemberCreateInput } from "@/lib/school-domain";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { importSchoolMembers } from "@/lib/server/school-member-provisioning-service";

export const runtime = "nodejs";

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ rows?: SchoolMemberCreateInput[] }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求参数无效");
    try {
        return schoolApiOk(await importSchoolMembers(user.id, Array.isArray(parsed.data.rows) ? parsed.data.rows : []));
    } catch (error) {
        return schoolApiFailure(error, "导入学校成员失败");
    }
}
