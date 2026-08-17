import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { SchoolMemberPatch } from "@/lib/school-domain";
import { schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { removeSchoolMember, updateSchoolMember } from "@/lib/server/school-tenant-service";

export const runtime = "nodejs";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<SchoolMemberPatch>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    try {
        return schoolApiOk(await updateSchoolMember(user.id, (await context.params).id, parsed.data));
    } catch (error) {
        return schoolApiFailure(error, "更新学校成员失败");
    }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        return schoolApiOk({ removed: await removeSchoolMember(user.id, (await context.params).id) });
    } catch (error) {
        return schoolApiFailure(error, "移除学校成员失败");
    }
}
