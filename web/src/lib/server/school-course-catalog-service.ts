import { randomUUID } from "node:crypto";

import type { CourseMaterial, PlatformCourseDetail, SchoolCourseCatalogChapter, SchoolCourseCatalogDetail, SchoolCourseCatalogEntry, SchoolCourseCatalogItem, SchoolCourseCatalogMaterial } from "@/lib/school-domain";
import { createPlatformLessonTemplateRepository } from "@/lib/server/platform-lesson-template-repository";
import { createSchoolDomainRepository, type CourseCatalogEntryRecord, type CourseCatalogPageQuery, type CourseMaterialRecord, type PlatformCourseRecord } from "@/lib/server/school-domain-repository";
import { requireActiveSchoolContext, requireSchoolManager, SchoolServiceError } from "@/lib/server/school-access-service";

/*
 * 备课大厅（课程大厅）：
 * - 全平台已发布课程对所有有学校身份的人可见，「本校是否解锁」由 school_course_assignments 决定；
 * - 锁定状态只给课程简介 + 章节/课时标题 + 资料文件名，不给资料地址、课时说明和封面原图；
 * - 解锁 = 学校管理员写入一条 active 的本校课程授权，之后课程进入教学中心，老师即可备课。
 */

export async function listSchoolCourseCatalog(userId: string, input: CourseCatalogPageQuery) {
    const context = await requireActiveSchoolContext(userId);
    const result = await createSchoolDomainRepository().listCourseCatalog(context.school.id, input);
    return { ...result, items: result.items.map((entry) => toCatalogEntry(entry, context.canManageSchool)) };
}

export async function getSchoolCourseCatalogDetail(userId: string, courseId: string): Promise<SchoolCourseCatalogDetail> {
    const context = await requireActiveSchoolContext(userId);
    const repository = createSchoolDomainRepository();
    const course = await repository.getPlatformCourse(courseId);
    if (!course || course.status !== "published") throw new SchoolServiceError(404, "课程不存在或尚未上架");
    const assignment = await repository.getActiveCourseAssignmentByCourse(context.school.id, courseId);
    const tree = await repository.getPlatformCourseTree(courseId, assignment ? { schoolCourseAssignmentId: assignment.id } : {});
    if (!tree) throw new SchoolServiceError(404, "课程不存在或尚未上架");
    const templateLessonCount = await createPlatformLessonTemplateRepository().countTemplates(tree.chapters.flatMap((chapter) => chapter.lessons.map((lesson) => lesson.id)));
    return toCatalogDetail(tree, assignment?.id, templateLessonCount, context.canManageSchool);
}

/** 学校管理员解锁一门课程：写入（或恢复）本校 active 课程授权，返回解锁后的课程条目 */
export async function unlockSchoolCourse(userId: string, courseId: string): Promise<SchoolCourseCatalogEntry> {
    const context = await requireSchoolManager(userId);
    const repository = createSchoolDomainRepository();
    const course = await repository.getPlatformCourse(courseId);
    if (!course || course.status !== "published") throw new SchoolServiceError(404, "课程不存在或尚未上架");
    const existing = await repository.getActiveCourseAssignmentByCourse(context.school.id, courseId);
    if (existing) return toCatalogEntry({ ...course, assignmentId: existing.id, unlocked: true }, context.canManageSchool);
    const now = new Date().toISOString();
    const [assignment] = await repository.assignCourseToSchools(courseId, [{ id: randomUUID(), schoolId: context.school.id, status: "active", createdAt: now, updatedAt: now }]);
    if (!assignment) throw new SchoolServiceError(500, "课程解锁失败");
    return toCatalogEntry({ ...course, assignmentId: assignment.id, unlocked: true }, context.canManageSchool);
}

/** 备课大厅的课程封面：任何本校成员都能看已上架课程的封面（是否解锁不影响浏览） */
export async function readCatalogCourseCoverKey(userId: string, courseId: string) {
    await requireActiveSchoolContext(userId);
    const course = await createSchoolDomainRepository().getPlatformCourse(courseId);
    if (!course || course.status !== "published") throw new SchoolServiceError(404, "课程封面不存在");
    const key = (course.content as { coverStorageKey?: unknown })?.coverStorageKey;
    if (typeof key !== "string" || !key) throw new SchoolServiceError(404, "课程封面不存在");
    return key;
}

function toCatalogEntry(record: CourseCatalogEntryRecord, canManageSchool: boolean): SchoolCourseCatalogEntry {
    const summary = toCourseSummary(record);
    return {
        ...summary,
        ...(hasCoverKey(record) ? { coverUrl: catalogCoverUrl(record.id) } : {}),
        ...(record.assignmentId ? { assignmentId: record.assignmentId } : {}),
        unlocked: record.unlocked,
        canUnlock: canManageSchool && !record.unlocked,
    };
}

function toCatalogDetail(tree: PlatformCourseDetail, assignmentId: string | undefined, templateLessonCount: number, canManageSchool: boolean): SchoolCourseCatalogDetail {
    const unlocked = Boolean(assignmentId);
    const chapters: SchoolCourseCatalogChapter[] = tree.chapters.map((chapter) => ({
        ...chapter,
        // 锁定状态不给章节/课时说明，也不给资料地址与存储键：只保留「有什么」的目录信息
        description: unlocked ? chapter.description : "",
        materials: chapter.materials.map((material) => toCatalogMaterial(material, unlocked)),
        lessons: chapter.lessons.map((lesson): SchoolCourseCatalogItem => ({
            ...lesson,
            description: unlocked ? lesson.description : "",
            materials: lesson.materials.map((material) => toCatalogMaterial(material, unlocked)),
        })),
    }));
    return {
        ...toCourseSummary(tree),
        coverUrl: catalogCoverUrl(tree.id),
        chapters,
        ...(assignmentId ? { assignmentId } : {}),
        unlocked,
        canUnlock: canManageSchool && !unlocked,
        templateLessonCount,
    };
}

function toCatalogMaterial(material: CourseMaterial | CourseMaterialRecord, unlocked: boolean): SchoolCourseCatalogMaterial {
    return {
        id: material.id,
        title: material.title,
        fileName: material.fileName,
        mimeType: material.mimeType,
        bytes: material.bytes,
        ...(material.chapterId ? { chapterId: material.chapterId } : {}),
        ...(material.lessonId ? { lessonId: material.lessonId } : {}),
        ...(unlocked ? { url: material.url, storageKey: material.storageKey } : {}),
    };
}

/** 大厅只暴露课程展示信息，content 里的封面键、内部配置不外发 */
function toCourseSummary(record: Omit<PlatformCourseRecord, "content"> & { content?: unknown }) {
    const content = (record.content as Record<string, unknown>) || {};
    const category = typeof content.category === "string" ? content.category : undefined;
    const validUntil = typeof content.validUntil === "string" ? content.validUntil : null;
    return {
        id: record.id,
        title: record.title,
        summary: record.summary,
        content: {} as Record<string, unknown>,
        ...(category ? { category } : {}),
        ...(validUntil ? { validUntil } : {}),
        chapterCount: record.chapterCount || 0,
        lessonCount: record.lessonCount || 0,
        materialCount: record.materialCount || 0,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

function hasCoverKey(record: { content?: unknown }) {
    return typeof (record.content as { coverStorageKey?: unknown })?.coverStorageKey === "string";
}

function catalogCoverUrl(courseId: string) {
    return `/api/school/course-catalog/${encodeURIComponent(courseId)}/cover`;
}
