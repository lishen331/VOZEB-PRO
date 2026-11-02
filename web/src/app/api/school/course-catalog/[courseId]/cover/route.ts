import sharp from "sharp";
import { getCurrentUser } from "@/lib/auth/session";
import { CREATIVE_UPLOAD_MAX_BYTES } from "@/lib/creative-upload";
import { readCatalogCourseCoverKey } from "@/lib/server/school-course-catalog-service";
import { getLocalMediaRegistration } from "@/lib/server/local-media-registry";
import { readRegisteredMediaBytes } from "@/lib/server/object-storage-service";
import { schoolApiError, schoolApiFailure } from "@/lib/server/school-api-response";

export const runtime = "nodejs";
type Context = { params: Promise<{ courseId: string }> };

/** 课程中心封面：浏览课程不需要解锁，所以按课程可见性而不是本校授权来校验 */
export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return schoolApiError(401, "请先登录");
    try {
        const key = await readCatalogCourseCoverKey(user.id, (await context.params).courseId);
        const registration = await getLocalMediaRegistration(key);
        if (!registration || registration.storageClass !== "permanent" || registration.type !== "image") return schoolApiError(404, "课程封面不存在");
        const bytes = await readRegisteredMediaBytes(registration, CREATIVE_UPLOAD_MAX_BYTES);
        const image = await sharp(bytes).resize({ width: 960, withoutEnlargement: true }).webp().toBuffer();
        return new Response(new Uint8Array(image), { headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=300", "X-Content-Type-Options": "nosniff" } });
    } catch (error) {
        return schoolApiFailure(error, "课程封面读取失败");
    }
}
