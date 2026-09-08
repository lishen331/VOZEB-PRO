import sharp from "sharp";
import { CREATIVE_UPLOAD_MAX_BYTES } from "@/lib/creative-upload";
import { writePersistentMediaDataUrl } from "@/lib/server/reference-asset-store";
import { getLocalMediaRegistration } from "@/lib/server/local-media-registry";
import { readRegisteredMediaBytes } from "@/lib/server/object-storage-service";
import { createSchoolDomainRepository } from "@/lib/server/school-domain-repository";
import { requireSchoolManager, SchoolServiceError } from "@/lib/server/school-access-service";

export async function uploadCourseCover(adminId: string, bytes: Uint8Array) {
    if (!bytes.length) throw new SchoolServiceError(400, "请选择本地封面图片");
    if (bytes.length > CREATIVE_UPLOAD_MAX_BYTES) throw new SchoolServiceError(413, "封面图片不能超过 20MB");
    let image: Buffer;
    try {
        const pipeline = sharp(bytes);
        const metadata = await pipeline.metadata();
        if (!["jpeg", "png", "webp"].includes(metadata.format || "")) throw new Error("unsupported image");
        image = await pipeline.rotate().webp().toBuffer();
    } catch {
        throw new SchoolServiceError(415, "封面必须是有效的 PNG、JPG 或 WebP 图片");
    }
    const asset = await writePersistentMediaDataUrl(`data:image/webp;base64,${image.toString("base64")}`, "image", { ownerUserId: adminId, source: "course-cover", originalName: "course-cover.webp", maxBytes: CREATIVE_UPLOAD_MAX_BYTES });
    return { storageKey: asset.token, previewUrl: `/api/reference-assets/${asset.token.split("/").map(encodeURIComponent).join("/")}` };
}

export async function readSchoolCourseCover(userId: string, assignmentId: string) {
    const context = await requireSchoolManager(userId);
    const repository = createSchoolDomainRepository();
    const assignment = await repository.getSchoolCourseAssignment(context.school.id, assignmentId);
    if (!assignment || assignment.status !== "active") throw new SchoolServiceError(404, "课程封面不存在");
    const course = await repository.getPlatformCourse(assignment.courseId);
    if (!course || course.status !== "published") throw new SchoolServiceError(404, "课程封面不存在");
    const key = (course.content as { coverStorageKey?: unknown })?.coverStorageKey;
    if (typeof key !== "string" || !key) throw new SchoolServiceError(404, "课程封面不存在");
    const registration = await getLocalMediaRegistration(key);
    if (!registration || registration.storageClass !== "permanent" || registration.type !== "image") throw new SchoolServiceError(404, "课程封面不存在");
    const bytes = await readRegisteredMediaBytes(registration, CREATIVE_UPLOAD_MAX_BYTES);
    return sharp(bytes).resize({ width: 960, withoutEnlargement: true }).webp().toBuffer();
}
