import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { TeachingAssignmentInput } from "@/lib/school-domain";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk, positiveInteger } from "@/lib/server/school-api-response";
import { createTeachingAssignment, listTeachingAssignments } from "@/lib/server/school-course-service";

export const runtime = "nodejs";

export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    try {
        return schoolApiOk(await listTeachingAssignments(user.id, { page: positiveInteger(params.get("page"), 1), pageSize: positiveInteger(params.get("pageSize"), 20) }));
    } catch (error) {
        return schoolApiFailure(error, "读取教学任务失败");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<TeachingAssignmentInput & { offeringId?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    if (typeof parsed.data.offeringId !== "string") return schoolApiError(400, "缺少课程安排");
    try {
        const { offeringId, ...input } = parsed.data;
        return schoolApiOk(await createTeachingAssignment(user.id, offeringId, input));
    } catch (error) {
        return schoolApiFailure(error, "创建教学任务失败");
    }
}
