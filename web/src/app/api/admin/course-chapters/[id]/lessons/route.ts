import { readJsonBodyResult } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { isSchoolApiObject, schoolApiError, schoolApiFailure, schoolApiOk } from "@/lib/server/school-api-response";
import { createPlatformLesson } from "@/lib/server/school-course-service";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) return schoolApiError(401, "请先登录");
    const parsed = await readJsonBodyResult<{ title?: string; description?: string; sortOrder?: number }>(request);
    if (!parsed.ok) return schoolApiError(parsed.status, parsed.message);
    if (!isSchoolApiObject(parsed.data)) return schoolApiError(400, "请求内容无效");
    try {
        return schoolApiOk(await createPlatformLesson(user.id, (await context.params).id, { ...parsed.data, title: typeof parsed.data.title === "string" ? parsed.data.title : "" }));
    } catch (error) {
        return schoolApiFailure(error, "创建课时失败");
    }
}
