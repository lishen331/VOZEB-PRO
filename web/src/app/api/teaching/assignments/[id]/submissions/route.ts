import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk, positiveInteger } from "@/lib/server/school-api-response";
import { listTeachingSubmissions, submitTeachingAssignment } from "@/lib/server/school-course-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const params = new URL(request.url).searchParams;
    try {
        return schoolApiOk(await listTeachingSubmissions(user.id, (await context.params).id, { page: positiveInteger(params.get("page"), 1), pageSize: positiveInteger(params.get("pageSize"), 20) }));
    } catch (error) {
        return schoolApiFailure(error, "读取提交记录失败");
    }
}

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ note?: unknown; references?: unknown }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    try {
        return schoolApiOk(await submitTeachingAssignment(user.id, (await context.params).id, { note: typeof parsed.data.note === "string" ? parsed.data.note : "", references: parsed.data.references }));
    } catch (error) {
        return schoolApiFailure(error, "提交作业失败");
    }
}
