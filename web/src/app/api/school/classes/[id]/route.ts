import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { SchoolClassInput } from "@/lib/school-domain";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { getSchoolClass, removeSchoolClass, updateSchoolClass, updateSchoolClassWithMembers } from "@/lib/server/school-tenant-service";

export const runtime = "nodejs";

type ClassPatch = Partial<SchoolClassInput> & { status?: "active" | "disabled"; teacherMembershipIds?: string[]; studentMembershipIds?: string[] };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        return schoolApiOk(await getSchoolClass(user.id, (await context.params).id));
    } catch (error) {
        return schoolApiFailure(error, "读取班级失败");
    }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<ClassPatch>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求参数无效");
    const id = (await context.params).id;
    const replacesMembers = "teacherMembershipIds" in parsed.data || "studentMembershipIds" in parsed.data;
    if (
        replacesMembers &&
        (!Array.isArray(parsed.data.teacherMembershipIds) ||
            parsed.data.teacherMembershipIds.some((id) => typeof id !== "string") ||
            !Array.isArray(parsed.data.studentMembershipIds) ||
            parsed.data.studentMembershipIds.some((id) => typeof id !== "string"))
    ) {
        return schoolApiError(400, "更新班级成员时必须同时提交有效的老师和学生列表");
    }
    try {
        if (replacesMembers) {
            return schoolApiOk(
                await updateSchoolClassWithMembers(user.id, id, parsed.data, {
                    teacherMembershipIds: parsed.data.teacherMembershipIds as string[],
                    studentMembershipIds: parsed.data.studentMembershipIds as string[],
                }),
            );
        }
        return schoolApiOk(await updateSchoolClass(user.id, id, parsed.data));
    } catch (error) {
        return schoolApiFailure(error, "更新班级失败");
    }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        return schoolApiOk(await removeSchoolClass(user.id, (await context.params).id));
    } catch (error) {
        return schoolApiFailure(error, "删除班级失败");
    }
}
