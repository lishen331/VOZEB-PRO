import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { deletePlatformLesson, updatePlatformLesson } from "@/lib/server/school-course-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ title?: string; description?: string; sortOrder?: number }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    try {
        return schoolApiOk(await updatePlatformLesson(user.id, (await context.params).id, parsed.data));
    } catch (error) {
        return schoolApiFailure(error, "更新课时失败");
    }
}

export async function DELETE(_request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    try {
        return schoolApiOk(await deletePlatformLesson(user.id, (await context.params).id));
    } catch (error) {
        return schoolApiFailure(error, "删除课时失败");
    }
}
