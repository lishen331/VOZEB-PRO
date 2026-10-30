import { ensurePostgresSchema, isPostgresDatabaseEnabled } from "@/lib/server/database/postgres";
import { createPlatformLessonTemplateRepository, toLessonTemplate } from "@/lib/server/platform-lesson-template-repository";
import { SchoolServiceError } from "@/lib/server/school-access-service";
import { requireEducationAdmin } from "@/lib/server/school-course-service";
import { createSchoolDomainRepository } from "@/lib/server/school-domain-repository";
import { isLessonTemplateEmpty, normalizeLessonTemplateContent, type PlatformLessonTemplate } from "@/lib/teaching-lesson-plan";

/*
 * 平台标准教案（课程方维护，老师只读）。管理员按课时读 / 存 / 删；
 * 存一份全空的标准教案等同删除，避免老师端出现一个什么都没有的「标准教案」。
 */

async function prepare() {
    if (isPostgresDatabaseEnabled()) await ensurePostgresSchema();
}

async function requireLesson(lessonId: string, forWrite: boolean) {
    const repository = createSchoolDomainRepository();
    const lesson = await repository.getCourseLesson(lessonId);
    if (!lesson) throw new SchoolServiceError(404, "课时不存在");
    if (forWrite) {
        const course = await repository.getPlatformCourse(lesson.courseId, true);
        if (!course) throw new SchoolServiceError(404, "课程不存在");
        if (course.status === "disabled") throw new SchoolServiceError(409, "课程已停用");
    }
    return lesson;
}

export async function getPlatformLessonTemplate(actorId: string, lessonId: string): Promise<PlatformLessonTemplate | null> {
    await prepare();
    await requireEducationAdmin(actorId);
    await requireLesson(lessonId, false);
    const record = await createPlatformLessonTemplateRepository().getTemplate(lessonId);
    return record ? toLessonTemplate(record) : null;
}

export async function savePlatformLessonTemplate(actorId: string, lessonId: string, input: unknown): Promise<PlatformLessonTemplate | null> {
    await prepare();
    await requireEducationAdmin(actorId);
    await requireLesson(lessonId, true);
    const content = normalizeLessonTemplateContent(input);
    const repository = createPlatformLessonTemplateRepository();
    if (isLessonTemplateEmpty(content)) {
        await repository.deleteTemplate(lessonId);
        return null;
    }
    const now = new Date().toISOString();
    return toLessonTemplate(await repository.saveTemplate({ lessonId, content, updatedByUserId: actorId, createdAt: now, updatedAt: now }));
}

export async function deletePlatformLessonTemplate(actorId: string, lessonId: string) {
    await prepare();
    await requireEducationAdmin(actorId);
    await requireLesson(lessonId, true);
    return { deleted: await createPlatformLessonTemplateRepository().deleteTemplate(lessonId) };
}
