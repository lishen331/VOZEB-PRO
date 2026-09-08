import { getCurrentUser } from "@/lib/auth/session";
import { readSchoolCourseCover } from "@/lib/server/course-cover-service";
import { schoolApiError, schoolApiFailure } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return schoolApiError(401, "请先登录");
    try {
        const bytes = await readSchoolCourseCover(user.id, (await context.params).id);
        return new Response(new Uint8Array(bytes), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    } catch (error) {
        return schoolApiFailure(error, "课程封面读取失败");
    }
}
