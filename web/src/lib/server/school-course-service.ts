import { randomUUID } from "node:crypto";

import { hasAdminPermission } from "@/lib/admin-permissions";
import { getPublicUsersByIds } from "@/lib/auth/store";
import type {
    CourseOfferingInput,
    CourseChapter,
    CourseLesson,
    CourseMaterial,
    PlatformCourseDetail,
    PageResult,
    PlatformCourse,
    PlatformCourseInput,
    PlatformCoursePatch,
    PlatformCourseStatus,
    SchoolCourseAssignment,
    SchoolCourseOffering,
    SchoolPublicIdentity,
    TeachingAssignment,
    TeachingAssignmentInput,
    TeachingAssignmentKind,
    TeachingAssignmentStatus,
    TeachingSubmission,
} from "@/lib/school-domain";
import type {
    CourseChapterRecord,
    CourseLessonRecord,
    CourseMaterialRecord,
    PlatformCourseRecord,
    SchoolCourseOfferingRecord,
    SchoolDomainRepository,
    SchoolMembershipRecord,
    TeachingAssignmentRecord,
    TeachingSubmissionRecord,
} from "@/lib/server/school-domain-repository";
import type { JsonValue } from "@/lib/server/database/repository-types";
import { createSchoolDomainRepository } from "@/lib/server/school-domain-repository";
import { validateSchoolContentReferences } from "./school-content-reference-service";
import { resolveTeachingSubmissionReferences } from "./school-submission-reference-service";
import { requireActiveSchoolContext, requireSchoolManager, requireStudent, requireTeacher, SchoolServiceError } from "./school-access-service";
import { getLocalMediaRegistrations } from "@/lib/server/local-media-registry";
import { cleanupDeletedCourseMaterials } from "./course-attachment-service";

export async function listPlatformCourses(actorId: string, input: { page?: number; pageSize?: number; keyword?: string; status?: PlatformCourse["status"] } = {}) {
    await requireEducationAdmin(actorId);
    const result = await createSchoolDomainRepository().listPlatformCourses(input);
    return { ...result, items: result.items.map(toPlatformCourse) };
}

export async function getPlatformCourse(actorId: string, courseId: string) {
    await requireEducationAdmin(actorId);
    const course = await createSchoolDomainRepository().getPlatformCourse(courseId);
    if (!course) throw new SchoolServiceError(404, "课程不存在");
    return toPlatformCourse(course);
}

export async function createPlatformCourse(actorId: string, input: PlatformCourseInput): Promise<PlatformCourse> {
    await requireEducationAdmin(actorId);
    const now = new Date().toISOString();
    const record: PlatformCourseRecord = {
        id: randomUUID(),
        title: requiredText(input.title, "课程标题", 160),
        summary: text(input.summary, 500),
        content: objectValue(input.content),
        status: "draft",
        createdByUserId: actorId,
        createdAt: now,
        updatedAt: now,
    };
    return toPlatformCourse(await createSchoolDomainRepository().insertPlatformCourse(record));
}

export async function updatePlatformCourse(actorId: string, courseId: string, input: PlatformCoursePatch): Promise<PlatformCourse> {
    await requireEducationAdmin(actorId);
    if (input.status !== undefined && !isPlatformCourseStatus(input.status)) throw new SchoolServiceError(400, "课程状态无效");
    const repository = createSchoolDomainRepository();
    const existing = await repository.getPlatformCourse(courseId);
    if (!existing) throw new SchoolServiceError(404, "课程不存在");
    if (existing.status === "disabled" && input.status === "published") throw new SchoolServiceError(409, "停用课程请使用恢复操作");
    const patch = {
        ...(input.title === undefined ? {} : { title: requiredText(input.title, "课程标题", 160) }),
        ...(input.summary === undefined ? {} : { summary: text(input.summary, 500) }),
        ...(input.content === undefined ? {} : { content: objectValue(input.content) }),
        ...(input.status === undefined ? {} : { status: input.status }),
        updatedAt: new Date().toISOString(),
    };
    const updated = await repository.updatePlatformCourse(courseId, patch);
    if (!updated) throw new SchoolServiceError(404, "课程不存在");
    return toPlatformCourse(updated);
}

export async function getPlatformCourseTree(actorId: string, courseId: string) {
    await requireEducationAdmin(actorId);
    const tree = await createSchoolDomainRepository().getPlatformCourseTree(courseId);
    if (!tree) throw new SchoolServiceError(404, "课程不存在");
    return tree;
}

export async function getSchoolCourseTree(userId: string, assignmentId: string) {
    const context = await requireActiveSchoolContext(userId);
    const repository = createSchoolDomainRepository();
    const assignment = await repository.getSchoolCourseAssignment(context.school.id, assignmentId);
    if (!assignment || assignment.status !== "active") throw new SchoolServiceError(404, "学校课程不存在");
    const course = await repository.getPlatformCourse(assignment.courseId);
    if (!course || course.status !== "published") throw new SchoolServiceError(404, "学校课程不存在");
    if (!context.canManageSchool && !(await repository.hasVisibleCourseAssignment(context.school.id, context.membership.id, context.membership.role, assignmentId))) throw new SchoolServiceError(404, "学校课程不存在");
    return repository.getPlatformCourseTree(course.id, { schoolCourseAssignmentId: assignmentId });
}

export async function createPlatformChapter(actorId: string, courseId: string, input: { title: string; description?: string; sortOrder?: number }) {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    await requireEditableCourse(repository, courseId);
    const now = new Date().toISOString();
    return repository.insertCourseChapter({ id: randomUUID(), courseId, title: requiredText(input.title, "章节标题", 160), description: text(input.description, 2000), sortOrder: positiveOrder(input.sortOrder), createdAt: now, updatedAt: now });
}

export async function updatePlatformChapter(actorId: string, chapterId: string, input: { title?: string; description?: string; sortOrder?: number }) {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    const chapter = await findChapter(repository, chapterId);
    if (!chapter) throw new SchoolServiceError(404, "章节不存在");
    await requireEditableCourse(repository, chapter.courseId);
    const updated = await repository.updateCourseChapter(chapter.courseId, chapterId, {
        ...(input.title === undefined ? {} : { title: requiredText(input.title, "章节标题", 160) }),
        ...(input.description === undefined ? {} : { description: text(input.description, 2000) }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: positiveOrder(input.sortOrder) }),
        updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new SchoolServiceError(404, "章节不存在");
    return updated;
}

export async function deletePlatformChapter(actorId: string, chapterId: string) {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    const chapter = await findChapter(repository, chapterId);
    if (!chapter) throw new SchoolServiceError(404, "章节不存在");
    await requireEditableCourse(repository, chapter.courseId);
    const tree = await repository.getPlatformCourseTree(chapter.courseId);
    const selected = tree?.chapters.find((item) => item.id === chapterId);
    const storageKeys = [...(selected?.materials || []), ...(selected?.lessons.flatMap((lesson) => lesson.materials) || [])].map((material) => material.storageKey);
    const deleted = await repository.deleteCourseChapter(chapter.courseId, chapterId);
    return { deleted, cleanup: deleted ? await cleanupDeletedCourseMaterials(storageKeys) : { deletedFiles: 0, deletedBytes: 0, skippedShared: 0, failed: [] as string[] } };
}

export async function createPlatformLesson(actorId: string, chapterId: string, input: { title: string; description?: string; sortOrder?: number }) {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    const chapter = await findChapter(repository, chapterId);
    if (!chapter) throw new SchoolServiceError(404, "章节不存在");
    await requireEditableCourse(repository, chapter.courseId);
    const now = new Date().toISOString();
    return repository.insertCourseLesson({
        id: randomUUID(),
        courseId: chapter.courseId,
        chapterId,
        title: requiredText(input.title, "课时标题", 160),
        description: text(input.description, 2000),
        sortOrder: positiveOrder(input.sortOrder),
        createdAt: now,
        updatedAt: now,
    });
}

export async function updatePlatformLesson(actorId: string, lessonId: string, input: { title?: string; description?: string; sortOrder?: number }) {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    const lesson = await findLesson(repository, lessonId);
    if (!lesson) throw new SchoolServiceError(404, "课时不存在");
    await requireEditableCourse(repository, lesson.courseId);
    const updated = await repository.updateCourseLesson(lesson.courseId, lessonId, {
        ...(input.title === undefined ? {} : { title: requiredText(input.title, "课时标题", 160) }),
        ...(input.description === undefined ? {} : { description: text(input.description, 2000) }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: positiveOrder(input.sortOrder) }),
        updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new SchoolServiceError(404, "课时不存在");
    return updated;
}

export async function deletePlatformLesson(actorId: string, lessonId: string) {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    const lesson = await findLesson(repository, lessonId);
    if (!lesson) throw new SchoolServiceError(404, "课时不存在");
    await requireEditableCourse(repository, lesson.courseId);
    const tree = await repository.getPlatformCourseTree(lesson.courseId);
    const materialKeys = tree?.chapters.flatMap((chapter) => chapter.lessons.find((item) => item.id === lessonId)?.materials || []).map((material) => material.storageKey) || [];
    const deleted = await repository.deleteCourseLesson(lesson.courseId, lessonId);
    return { deleted, cleanup: deleted ? await cleanupDeletedCourseMaterials(materialKeys) : { deletedFiles: 0, deletedBytes: 0, skippedShared: 0, failed: [] as string[] } };
}

export async function createPlatformMaterial(actorId: string, courseId: string, input: { chapterId?: string; lessonId?: string; title: string; storageKey: string; sortOrder?: number }) {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    await requireEditableCourse(repository, courseId);
    await assertTreeTarget(repository, courseId, input.chapterId, input.lessonId);
    return repository.insertCourseMaterial(await materialRecord(repository, actorId, courseId, input, "platform"));
}

export async function createSchoolMaterial(userId: string, assignmentId: string, input: { chapterId?: string; lessonId?: string; title: string; storageKey: string; sortOrder?: number }) {
    const context = await requireActiveSchoolContext(userId);
    const repository = createSchoolDomainRepository();
    const assignment = await repository.getSchoolCourseAssignment(context.school.id, assignmentId);
    if (!assignment || assignment.status !== "active") throw new SchoolServiceError(404, "学校课程不存在");
    const course = await repository.getPlatformCourse(assignment.courseId);
    if (!course || course.status !== "published") throw new SchoolServiceError(409, "课程未发布或已停用");
    if (context.membership.role !== "teacher") throw new SchoolServiceError(403, "只有老师可以上传本校资料");
    if (!context.canManageSchool && !(await repository.hasActiveOfferingForTeacher(context.school.id, context.membership.id, assignmentId))) throw new SchoolServiceError(403, "当前老师不是该课程负责人");
    await assertTreeTarget(repository, assignment.courseId, input.chapterId, input.lessonId);
    return repository.insertCourseMaterial(await materialRecord(repository, userId, assignment.courseId, input, "school", assignmentId));
}

export async function updateCourseMaterial(userId: string, materialId: string, input: { title?: string; sortOrder?: number; status?: "active" | "disabled" }) {
    const repository = createSchoolDomainRepository();
    let material = await repository.getCourseMaterial(materialId);
    let schoolContext: Awaited<ReturnType<typeof requireActiveSchoolContext>> | null = null;
    if (!material) {
        schoolContext = await requireActiveSchoolContext(userId);
        material = await repository.getCourseMaterial(materialId, schoolContext.school.id);
    }
    if (!material) throw new SchoolServiceError(404, "课程资料不存在");
    if (material.sourceScope === "platform") {
        await requireEducationAdmin(userId);
    } else {
        const context = schoolContext || (await requireActiveSchoolContext(userId));
        if (!(await repository.getCourseMaterial(materialId, context.school.id))) throw new SchoolServiceError(404, "课程资料不存在");
        await assertSchoolMaterialManager(repository, context.school.id, context.membership.id, context.canManageSchool, material.schoolCourseAssignmentId);
    }
    const updated = await repository.updateCourseMaterial(materialId, {
        ...(input.title === undefined ? {} : { title: requiredText(input.title, "资料标题", 260) }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: positiveOrder(input.sortOrder) }),
        ...(input.status === undefined ? {} : { status: input.status }),
        updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new SchoolServiceError(404, "课程资料不存在");
    return updated;
}

export async function deleteCourseMaterial(userId: string, materialId: string) {
    const repository = createSchoolDomainRepository();
    let material = await repository.getCourseMaterial(materialId);
    let schoolContext: Awaited<ReturnType<typeof requireActiveSchoolContext>> | null = null;
    if (!material) {
        schoolContext = await requireActiveSchoolContext(userId);
        material = await repository.getCourseMaterial(materialId, schoolContext.school.id);
    }
    if (!material) throw new SchoolServiceError(404, "课程资料不存在");
    if (material.sourceScope === "platform") await requireEducationAdmin(userId);
    else {
        const context = schoolContext || (await requireActiveSchoolContext(userId));
        if (!(await repository.getCourseMaterial(materialId, context.school.id))) throw new SchoolServiceError(404, "课程资料不存在");
        await assertSchoolMaterialManager(repository, context.school.id, context.membership.id, context.canManageSchool, material.schoolCourseAssignmentId);
    }
    const deleted = await repository.deleteCourseMaterial(materialId);
    return { deleted, cleanup: deleted ? await cleanupDeletedCourseMaterials([material.storageKey]) : { deletedFiles: 0, deletedBytes: 0, skippedShared: 0, failed: [] as string[] } };
}

export async function disableCourse(actorId: string, courseId: string) {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    const course = await repository.getPlatformCourse(courseId, true);
    if (!course) throw new SchoolServiceError(404, "课程不存在");
    if (course.status !== "published") throw new SchoolServiceError(409, "只有已发布课程可以停用");
    const result = await repository.disablePlatformCourse(courseId, { deletedAt: new Date().toISOString(), deletedByUserId: actorId, updatedAt: new Date().toISOString() });
    if (!result) throw new SchoolServiceError(404, "课程不存在");
    return toPlatformCourse((await repository.getPlatformCourse(courseId)) || result);
}

export async function restoreCourse(actorId: string, courseId: string) {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    const result = await repository.restorePlatformCourse(courseId, { updatedAt: new Date().toISOString() });
    if (!result) throw new SchoolServiceError(404, "停用课程不存在");
    return toPlatformCourse((await repository.getPlatformCourse(courseId)) || result);
}

export async function getCourseDeletionImpact(actorId: string, courseId: string) {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    if (!(await repository.getPlatformCourse(courseId))) throw new SchoolServiceError(404, "课程不存在");
    return repository.getPlatformCourseDeletionImpact(courseId);
}

export async function permanentlyDeleteCourse(actorId: string, courseId: string, titleConfirmation: string) {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    const course = await repository.getPlatformCourse(courseId, true);
    if (!course) throw new SchoolServiceError(404, "课程不存在");
    if (titleConfirmation !== course.title) throw new SchoolServiceError(400, "请输入完整课程名称确认永久删除");
    const impact = await repository.getPlatformCourseDeletionImpact(courseId);
    const deleted = await repository.permanentlyDeletePlatformCourse(courseId);
    const cleanup = await cleanupDeletedCourseMaterials(deleted.storageKeys);
    return { courseId, impact, cleanup };
}

export async function assignCourseToSchools(actorId: string, courseId: string, schoolIds: string[]): Promise<SchoolCourseAssignment[]> {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    const ids = Array.from(new Set(schoolIds.map((id) => id.trim()).filter(Boolean))).sort();
    if (!ids.length) throw new SchoolServiceError(400, "至少选择一所学校");
    const result = await repository.transact(async (transaction) => {
        const course = await transaction.getPlatformCourse(courseId, true);
        if (!course) throw new SchoolServiceError(404, "课程不存在");
        if (course.status !== "published") throw new SchoolServiceError(409, "只有已发布课程可以分配");
        for (const schoolId of ids) {
            if (!(await transaction.getSchool(schoolId, true))) throw new SchoolServiceError(404, "学校不存在");
        }
        const now = new Date().toISOString();
        const records = ids.map((schoolId) => ({ id: randomUUID(), schoolId, status: "active" as const, createdAt: now, updatedAt: now }));
        return { course, assignments: await transaction.assignCourseToSchools(courseId, records) };
    });
    return result.assignments.map((assignment) => ({ ...assignment, course: toPlatformCourse(result.course) }));
}

export async function listSchoolCourses(userId: string, input: { page?: number; pageSize?: number }): Promise<PageResult<SchoolCourseAssignment>> {
    const context = await requireSchoolManager(userId);
    const repository = createSchoolDomainRepository();
    const result = await repository.listAssignedCourses(context.school.id, input);
    const items = await Promise.all(
        result.items.map(async (assignment) => {
            const course = await repository.getPlatformCourse(assignment.courseId);
            return course ? ({ ...assignment, course: toPlatformCourse(course) } satisfies SchoolCourseAssignment) : null;
        }),
    );
    return { ...result, items: items.filter((item): item is SchoolCourseAssignment => Boolean(item)) };
}

export async function listCourseOfferings(managerId: string, assignmentId: string, input: { page?: number; pageSize?: number }) {
    const context = await requireSchoolManager(managerId);
    const repository = createSchoolDomainRepository();
    await requireActiveCourseAssignment(repository, context.school.id, assignmentId);
    return mapPage(await repository.listOfferingsForAssignment(context.school.id, assignmentId, input), (offering) => toCourseOffering(repository, offering));
}

export async function createCourseOffering(managerId: string, assignmentId: string, input: CourseOfferingInput): Promise<SchoolCourseOffering> {
    const context = await requireSchoolManager(managerId);
    if (input.status !== undefined && !isSchoolStatus(input.status)) throw new SchoolServiceError(400, "课程安排状态无效");
    const repository = createSchoolDomainRepository();
    let offering: SchoolCourseOfferingRecord;
    try {
        offering = await repository.transact(async (transaction) => {
            await requireActiveCourseAssignment(transaction, context.school.id, assignmentId);
            const schoolClass = await transaction.getClass(context.school.id, requiredSelection(input.classId, "班级"), true);
            if (!schoolClass) throw new SchoolServiceError(404, "班级不存在");
            if (schoolClass.status !== "active") throw new SchoolServiceError(409, "班级已停用，不能创建新的教学安排");
            const teacher = await transaction.getMembership(context.school.id, requiredSelection(input.teacherMembershipId, "负责老师"), true);
            if (!teacher) throw new SchoolServiceError(404, "负责老师不存在");
            if (teacher.status !== "active") throw new SchoolServiceError(409, "负责老师已停用，不能创建新的教学安排");
            if (teacher.role !== "teacher") throw new SchoolServiceError(400, "负责老师必须是本校老师");
            const now = new Date().toISOString();
            return transaction.insertCourseOffering({
                id: randomUUID(),
                schoolId: context.school.id,
                assignmentId,
                classId: schoolClass.id,
                teacherMembershipId: teacher.id,
                status: input.status === "disabled" ? "disabled" : "active",
                createdAt: now,
                updatedAt: now,
            });
        });
    } catch (error) {
        if (isDuplicateCourseOfferingError(error)) throw new SchoolServiceError(409, "该课程已为此班级和老师创建教学安排");
        throw error;
    }
    return toCourseOffering(repository, offering);
}

export async function listTeachingOfferings(teacherId: string, input: { page?: number; pageSize?: number }) {
    const context = await requireTeacher(teacherId);
    const repository = createSchoolDomainRepository();
    return mapPage(await repository.listOfferingsForTeacher(context.school.id, context.membership.id, input), (offering) => toCourseOffering(repository, offering));
}

export async function listTeachingCourses(userId: string, input: { page?: number; pageSize?: number }): Promise<PageResult<SchoolCourseAssignment>> {
    const context = await requireActiveSchoolContext(userId);
    const repository = createSchoolDomainRepository();
    const result = await repository.listVisibleCourses(context.school.id, context.membership.id, context.membership.role, input);
    const items = await Promise.all(
        result.items.map(async (assignment) => {
            const course = await repository.getPlatformCourse(assignment.courseId);
            return course ? ({ ...assignment, course: toPlatformCourse(course) } satisfies SchoolCourseAssignment) : null;
        }),
    );
    return { ...result, items: items.filter((item): item is SchoolCourseAssignment => Boolean(item)) };
}

export async function createTeachingAssignment(teacherId: string, offeringId: string, input: TeachingAssignmentInput): Promise<TeachingAssignment> {
    const context = await requireTeacher(teacherId);
    if (input.status !== undefined && !isTeachingAssignmentStatus(input.status)) throw new SchoolServiceError(400, "教学任务状态无效");
    const repository = createSchoolDomainRepository();
    const assignment = await repository.transact(async (transaction) => {
        const offeringSnapshot = await transaction.getCourseOffering(context.school.id, offeringId);
        if (!offeringSnapshot || offeringSnapshot.teacherMembershipId !== context.membership.id) throw new SchoolServiceError(404, "课程安排不存在或无权操作");
        await requireActiveCourseAssignment(transaction, context.school.id, offeringSnapshot.assignmentId);
        const offering = await transaction.getCourseOffering(context.school.id, offeringId, true);
        if (!offering || offering.assignmentId !== offeringSnapshot.assignmentId || offering.teacherMembershipId !== context.membership.id) throw new SchoolServiceError(404, "课程安排不存在或无权操作");
        if (offering.status !== "active") throw new SchoolServiceError(409, "课程安排已停用");
        const schoolClass = await transaction.getClass(context.school.id, offering.classId, true);
        if (!schoolClass || schoolClass.status !== "active") throw new SchoolServiceError(409, "班级已停用，不能创建新的教学安排");
        const kind = input.kind === "lesson" || input.kind === "homework" || input.kind === "commercial_practice" ? input.kind : null;
        if (!kind) throw new SchoolServiceError(400, "作业类型无效");
        await assertTeachingTarget(transaction, context.school.id, offeringSnapshot.assignmentId, input.chapterId, input.lessonId);
        const now = new Date().toISOString();
        return transaction.insertTeachingAssignment({
            id: randomUUID(),
            schoolId: context.school.id,
            offeringId,
            teacherMembershipId: context.membership.id,
            ...(input.chapterId ? { chapterId: input.chapterId } : {}),
            ...(input.lessonId ? { lessonId: input.lessonId } : {}),
            kind,
            title: requiredText(input.title, "作业标题", 160),
            instructions: text(input.instructions, 5000),
            resources: arrayValue(input.resources),
            dueAt: input.dueAt === undefined ? undefined : dueAtValue(input.dueAt) || undefined,
            status: input.status || "draft",
            createdAt: now,
            updatedAt: now,
        });
    });
    return toTeachingAssignment(repository, assignment);
}

export async function listTeachingAssignments(userId: string, input: { page?: number; pageSize?: number }) {
    const context = await requireActiveSchoolContext(userId);
    const repository = createSchoolDomainRepository();
    const result = context.membership.role === "teacher" ? await repository.listAssignmentsForTeacher(context.school.id, context.membership.id, input) : await repository.listAssignmentsForStudent(context.school.id, context.membership.id, input);
    return mapPage(result, (assignment) => toTeachingAssignment(repository, assignment));
}

export async function getTeachingAssignment(userId: string, assignmentId: string): Promise<TeachingAssignment> {
    const context = await requireActiveSchoolContext(userId);
    const repository = createSchoolDomainRepository();
    const assignment = await repository.getTeachingAssignment(context.school.id, assignmentId);
    if (!assignment) throw new SchoolServiceError(404, "教学任务不存在");
    if (context.membership.role === "student" && assignment.status !== "published" && assignment.status !== "closed") throw new SchoolServiceError(404, "教学任务不存在");
    const offering = await repository.getCourseOffering(context.school.id, assignment.offeringId);
    if (!offering) throw new SchoolServiceError(404, "课程安排不存在");
    const courseAssignment = await repository.getSchoolCourseAssignment(context.school.id, offering.assignmentId);
    const course = courseAssignment ? await repository.getPlatformCourse(courseAssignment.courseId) : null;
    if (!courseAssignment || courseAssignment.status !== "active" || !course || course.status !== "published") throw new SchoolServiceError(404, "教学任务不存在");
    if (context.membership.role === "teacher" && offering.teacherMembershipId !== context.membership.id) throw new SchoolServiceError(404, "教学任务不存在");
    if (context.membership.role === "student" && !(await repository.isClassMember(context.school.id, offering.classId, context.membership.id))) throw new SchoolServiceError(404, "教学任务不存在");
    return toTeachingAssignment(repository, assignment);
}

export async function updateTeachingAssignment(teacherId: string, assignmentId: string, input: Partial<TeachingAssignmentInput>): Promise<TeachingAssignment> {
    const context = await requireTeacher(teacherId);
    if (input.kind !== undefined && !isTeachingAssignmentKind(input.kind)) throw new SchoolServiceError(400, "作业类型无效");
    if (input.status !== undefined && !isTeachingAssignmentStatus(input.status)) throw new SchoolServiceError(400, "教学任务状态无效");
    const repository = createSchoolDomainRepository();
    const patch = {
        ...(input.kind === undefined ? {} : { kind: input.kind }),
        ...(input.title === undefined ? {} : { title: requiredText(input.title, "作业标题", 160) }),
        ...(input.instructions === undefined ? {} : { instructions: text(input.instructions, 5000) }),
        ...(input.resources === undefined ? {} : { resources: arrayValue(input.resources) }),
        ...(input.dueAt === undefined ? {} : { dueAt: dueAtValue(input.dueAt) }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.chapterId === undefined ? {} : { chapterId: input.chapterId || undefined }),
        ...(input.lessonId === undefined ? {} : { lessonId: input.lessonId || undefined }),
        updatedAt: new Date().toISOString(),
    };
    const assignment = await repository.transact(async (transaction) => {
        const assignmentSnapshot = await transaction.getTeachingAssignment(context.school.id, assignmentId);
        if (!assignmentSnapshot || assignmentSnapshot.teacherMembershipId !== context.membership.id) throw new SchoolServiceError(404, "教学任务不存在或无权操作");
        const offeringSnapshot = await transaction.getCourseOffering(context.school.id, assignmentSnapshot.offeringId);
        if (!offeringSnapshot || offeringSnapshot.teacherMembershipId !== context.membership.id) throw new SchoolServiceError(404, "课程安排不存在或无权操作");
        await requireActiveCourseAssignment(transaction, context.school.id, offeringSnapshot.assignmentId);
        const offering = await transaction.getCourseOffering(context.school.id, offeringSnapshot.id, true);
        if (!offering || offering.status !== "active" || offering.teacherMembershipId !== context.membership.id) throw new SchoolServiceError(409, "课程安排已停用");
        const schoolClass = await transaction.getClass(context.school.id, offering.classId, true);
        if (!schoolClass || schoolClass.status !== "active") throw new SchoolServiceError(409, "班级已停用，不能更新教学任务");
        const assignment = await transaction.getTeachingAssignment(context.school.id, assignmentId, true);
        if (!assignment || assignment.offeringId !== offering.id || assignment.teacherMembershipId !== context.membership.id) throw new SchoolServiceError(404, "教学任务不存在或无权操作");
        await assertTeachingTarget(transaction, context.school.id, offeringSnapshot.assignmentId, input.chapterId === undefined ? assignment.chapterId : input.chapterId, input.lessonId === undefined ? assignment.lessonId : input.lessonId);
        const updated = await transaction.updateTeachingAssignment(context.school.id, assignmentId, patch);
        if (!updated) throw new SchoolServiceError(404, "教学任务不存在");
        return updated;
    });
    return toTeachingAssignment(repository, assignment);
}

export async function listTeachingSubmissions(userId: string, assignmentId: string, input: { page?: number; pageSize?: number }) {
    const context = await requireActiveSchoolContext(userId);
    const repository = createSchoolDomainRepository();
    if (context.membership.role === "teacher") {
        await assertResponsibleTeacher(repository, context.school.id, context.membership.id, assignmentId);
        return mapPage(await repository.listTeachingSubmissions(context.school.id, assignmentId, input), (submission) => toTeachingSubmission(repository, submission));
    }
    const assignment = await repository.getTeachingAssignment(context.school.id, assignmentId);
    if (!assignment || (assignment.status !== "published" && assignment.status !== "closed")) throw new SchoolServiceError(404, "教学任务不存在");
    const offering = await repository.getCourseOffering(context.school.id, assignment.offeringId);
    if (!offering || !(await repository.isClassMember(context.school.id, offering.classId, context.membership.id))) throw new SchoolServiceError(404, "教学任务不存在");
    const submission = await repository.getTeachingSubmissionByAssignmentAndStudent(context.school.id, assignmentId, context.membership.id);
    const page = normalizePositiveInteger(input.page, 1);
    const pageSize = Math.min(100, normalizePositiveInteger(input.pageSize, 20));
    return { items: page === 1 && submission ? [await toTeachingSubmission(repository, submission)] : [], total: submission ? 1 : 0, page, pageSize };
}

export async function listOwnTeachingSubmissions(userId: string, input: { page?: number; pageSize?: number; assignmentIds?: string[] }) {
    const context = await requireStudent(userId);
    const repository = createSchoolDomainRepository();
    const result = await repository.listTeachingSubmissionsForStudent(context.school.id, context.membership.id, { ...input, assignmentIds: [...new Set(input.assignmentIds?.filter(Boolean) || [])] });
    return mapPage(result, (submission) => toTeachingSubmission(repository, submission));
}

export async function submitTeachingAssignment(studentId: string, assignmentId: string, input: { note?: string; references: unknown }): Promise<TeachingSubmission> {
    const context = await requireStudent(studentId);
    const repository = createSchoolDomainRepository();
    const previews = await validateSchoolContentReferences({ userId: studentId, schoolId: context.school.id, references: input.references });
    const references = previews.map((item) => item.reference);
    const submission = await repository.transact(async (transaction) => {
        const { offering } = await requireActiveTeachingPath(transaction, context.school.id, assignmentId);
        const student = await transaction.getMembership(context.school.id, context.membership.id, true);
        if (!student || student.role !== "student" || student.status !== "active") throw new SchoolServiceError(403, "当前账号没有可用的学生身份");
        if (!(await transaction.isClassMember(context.school.id, offering.classId, context.membership.id))) throw new SchoolServiceError(404, "教学任务不存在或无权提交");
        const now = new Date().toISOString();
        const existing = await transaction.getTeachingSubmissionByAssignmentAndStudent(context.school.id, assignmentId, context.membership.id, true);
        if (existing) {
            if (existing.status === "reviewed") throw new SchoolServiceError(409, "已通过的提交不能再次修改");
            const updated = await transaction.updateTeachingSubmission(context.school.id, existing.id, { note: text(input.note, 2000), contentReferences: references, status: "submitted", submittedAt: now, reviewedAt: "", updatedAt: now });
            if (!updated) throw new SchoolServiceError(404, "提交记录不存在");
            return updated;
        }
        return transaction.insertTeachingSubmission({
            id: randomUUID(),
            schoolId: context.school.id,
            assignmentId,
            studentMembershipId: context.membership.id,
            note: text(input.note, 2000),
            contentReferences: references,
            status: "submitted",
            feedback: "",
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
        });
    });
    return toTeachingSubmission(repository, submission);
}

export async function reviewTeachingSubmission(teacherId: string, submissionId: string, input: { status: "reviewed" | "revision_required"; feedback: string }): Promise<TeachingSubmission> {
    const context = await requireTeacher(teacherId);
    if (input.status !== "reviewed" && input.status !== "revision_required") throw new SchoolServiceError(400, "批改状态无效");
    const repository = createSchoolDomainRepository();
    const submission = await repository.transact(async (transaction) => {
        const teacher = await transaction.getMembership(context.school.id, context.membership.id, true);
        if (!teacher || teacher.role !== "teacher" || teacher.status !== "active") throw new SchoolServiceError(403, "当前账号没有可用的老师身份");
        const snapshot = await transaction.getTeachingSubmission(context.school.id, submissionId);
        if (!snapshot) throw new SchoolServiceError(404, "提交记录不存在");
        const { offering } = await requireActiveTeachingPath(transaction, context.school.id, snapshot.assignmentId, context.membership.id);
        const student = await transaction.getMembership(context.school.id, snapshot.studentMembershipId, true);
        if (!student || student.role !== "student" || student.status !== "active" || !(await transaction.isClassMember(context.school.id, offering.classId, student.id))) {
            throw new SchoolServiceError(409, "学生已不属于当前班级，提交记录仅可查看");
        }
        const current = await transaction.getTeachingSubmission(context.school.id, submissionId, true);
        if (!current || current.assignmentId !== snapshot.assignmentId || current.studentMembershipId !== snapshot.studentMembershipId) throw new SchoolServiceError(404, "提交记录不存在");
        if (current.status !== "submitted") throw new SchoolServiceError(409, "只有待批改提交可以更新评审结果");
        const updated = await transaction.updateTeachingSubmission(context.school.id, submissionId, { status: input.status, feedback: text(input.feedback, 5000), reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        if (!updated) throw new SchoolServiceError(404, "提交记录不存在");
        return updated;
    });
    return toTeachingSubmission(repository, submission);
}

async function assertResponsibleTeacher(repository: SchoolDomainRepository, schoolId: string, teacherMembershipId: string, assignmentId: string) {
    const assignment = await repository.getTeachingAssignment(schoolId, assignmentId);
    if (!assignment) throw new SchoolServiceError(404, "教学任务不存在");
    const offering = await repository.getCourseOffering(schoolId, assignment.offeringId);
    if (!offering || offering.teacherMembershipId !== teacherMembershipId) throw new SchoolServiceError(404, "教学任务不存在或无权操作");
    return assignment;
}

async function requireActiveTeachingPath(repository: SchoolDomainRepository, schoolId: string, assignmentId: string, teacherMembershipId?: string) {
    const assignmentSnapshot = await repository.getTeachingAssignment(schoolId, assignmentId);
    if (!assignmentSnapshot) throw new SchoolServiceError(404, "教学任务不存在或暂不可操作");
    const offeringSnapshot = await repository.getCourseOffering(schoolId, assignmentSnapshot.offeringId);
    if (!offeringSnapshot || (teacherMembershipId && offeringSnapshot.teacherMembershipId !== teacherMembershipId)) throw new SchoolServiceError(404, "教学任务不存在或无权操作");
    await requireActiveCourseAssignment(repository, schoolId, offeringSnapshot.assignmentId);
    const offering = await repository.getCourseOffering(schoolId, offeringSnapshot.id, true);
    if (!offering || offering.assignmentId !== offeringSnapshot.assignmentId || offering.status !== "active" || (teacherMembershipId && offering.teacherMembershipId !== teacherMembershipId)) {
        throw new SchoolServiceError(409, "课程安排已停用，历史记录仅可查看");
    }
    const schoolClass = await repository.getClass(schoolId, offering.classId, true);
    if (!schoolClass || schoolClass.status !== "active") throw new SchoolServiceError(409, "班级已停用，历史记录仅可查看");
    const assignment = await repository.getTeachingAssignment(schoolId, assignmentId, true);
    if (!assignment || assignment.offeringId !== offering.id || assignment.status !== "published") throw new SchoolServiceError(409, "教学任务已关闭，历史记录仅可查看");
    return { assignment, offering, schoolClass };
}

async function requireActiveCourseAssignment(repository: SchoolDomainRepository, schoolId: string, assignmentId: string) {
    const snapshot = await repository.getSchoolCourseAssignment(schoolId, assignmentId);
    if (!snapshot) throw new SchoolServiceError(404, "学校课程不存在");
    const course = await repository.getPlatformCourse(snapshot.courseId, true);
    if (!course) throw new SchoolServiceError(404, "课程不存在");
    const assignment = await repository.getSchoolCourseAssignment(schoolId, assignmentId, true);
    if (!assignment || assignment.courseId !== course.id) throw new SchoolServiceError(404, "学校课程不存在");
    if (assignment.status !== "active") throw new SchoolServiceError(409, "学校课程已停用，不能创建新的教学安排");
    if (course.status !== "published") throw new SchoolServiceError(409, "课程未发布或已停用，不能创建新的教学安排");
    return { assignment, course };
}

async function mapPage<T, U>(page: { items: T[]; total: number; page: number; pageSize: number }, mapper: (item: T) => Promise<U>) {
    return { ...page, items: await Promise.all(page.items.map(mapper)) };
}

async function toCourseOffering(repository: SchoolDomainRepository, record: SchoolCourseOfferingRecord): Promise<SchoolCourseOffering> {
    const [courseAssignment, schoolClass, teacherMembership] = await Promise.all([
        repository.getSchoolCourseAssignment(record.schoolId, record.assignmentId),
        repository.getClass(record.schoolId, record.classId),
        repository.getMembership(record.schoolId, record.teacherMembershipId),
    ]);
    const [course, teacher] = await Promise.all([courseAssignment ? repository.getPlatformCourse(courseAssignment.courseId) : null, toPublicIdentity(teacherMembership)]);
    return {
        ...record,
        courseTitle: course?.title || "课程信息不可用",
        className: schoolClass?.name || "班级信息不可用",
        teacher,
    };
}

async function toTeachingAssignment(repository: SchoolDomainRepository, record: TeachingAssignmentRecord): Promise<TeachingAssignment> {
    const offering = await repository.getCourseOffering(record.schoolId, record.offeringId);
    const [courseAssignment, schoolClass] = offering ? await Promise.all([repository.getSchoolCourseAssignment(record.schoolId, offering.assignmentId), repository.getClass(record.schoolId, offering.classId)]) : [null, null];
    const course = courseAssignment ? await repository.getPlatformCourse(courseAssignment.courseId) : null;
    return {
        ...record,
        resources: Array.isArray(record.resources) ? record.resources : [],
        courseTitle: course?.title || "课程信息不可用",
        className: schoolClass?.name || "班级信息不可用",
    };
}

async function toTeachingSubmission(repository: SchoolDomainRepository, record: TeachingSubmissionRecord): Promise<TeachingSubmission> {
    const membership = await repository.getMembership(record.schoolId, record.studentMembershipId);
    const contentReferences = Array.isArray(record.contentReferences) ? record.contentReferences : [];
    const resolvedContentReferences = membership?.userId
        ? await resolveTeachingSubmissionReferences({ ownerUserId: membership.userId, schoolId: record.schoolId, references: contentReferences })
        : contentReferences.map((reference) => ({ reference, title: "成果不可用", mediaType: "unknown" as const, availability: "unavailable" as const }));
    return { ...record, contentReferences, resolvedContentReferences, student: await toPublicIdentity(membership) };
}

async function toPublicIdentity(membership: SchoolMembershipRecord | null): Promise<SchoolPublicIdentity> {
    if (!membership?.userId) return { accountId: "", username: "", displayName: "成员信息不可用" };
    const user = (await getPublicUsersByIds([membership.userId]))[0];
    return {
        accountId: user?.accountId || "",
        username: user?.username || "",
        displayName: user?.displayName || "成员信息不可用",
    };
}

async function requireEducationAdmin(actorId: string) {
    const actor = (await getPublicUsersByIds([actorId]))[0];
    if (!hasAdminPermission(actor, "education.manage")) throw new SchoolServiceError(403, "当前管理员没有产教运营职责权限");
    return actor;
}

function requiredText(value: unknown, label: string, max: number) {
    const textValue = text(value, max);
    if (!textValue) throw new SchoolServiceError(400, `请填写${label}`);
    return textValue;
}

function requiredSelection(value: unknown, label: string) {
    const selected = text(value, 160);
    if (!selected) throw new SchoolServiceError(400, `请选择${label}`);
    return selected;
}

function isDuplicateCourseOfferingError(error: unknown) {
    if (error instanceof Error && error.message === "课程安排已存在") return true;
    if (!error || typeof error !== "object") return false;
    const candidate = error as { code?: unknown };
    return candidate.code === "23505";
}

function toPlatformCourse(record: PlatformCourseRecord): PlatformCourse {
    return {
        id: record.id,
        title: record.title,
        summary: record.summary,
        content: record.content as Record<string, unknown>,
        status: record.status,
        ...(record.deletedAt ? { deletedAt: record.deletedAt } : {}),
        ...(record.deletedByUserId ? { deletedByUserId: record.deletedByUserId } : {}),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        chapterCount: record.chapterCount || 0,
        lessonCount: record.lessonCount || 0,
        materialCount: record.materialCount || 0,
    };
}

async function requireEditableCourse(repository: SchoolDomainRepository, courseId: string) {
    const course = await repository.getPlatformCourse(courseId, true);
    if (!course) throw new SchoolServiceError(404, "课程不存在");
    if (course.status === "disabled") throw new SchoolServiceError(409, "课程已停用");
    return course;
}

async function findChapter(repository: SchoolDomainRepository, chapterId: string) {
    return repository.getCourseChapter(chapterId);
}

async function findLesson(repository: SchoolDomainRepository, lessonId: string) {
    return repository.getCourseLesson(lessonId);
}

async function assertTreeTarget(repository: SchoolDomainRepository, courseId: string, chapterId?: string, lessonId?: string) {
    if (Boolean(chapterId) === Boolean(lessonId)) throw new SchoolServiceError(400, "资料必须绑定一个章节或课时");
    const tree = await repository.getPlatformCourseTree(courseId);
    if (!tree) throw new SchoolServiceError(404, "课程不存在");
    if (chapterId && !tree.chapters.some((chapter) => chapter.id === chapterId)) throw new SchoolServiceError(404, "章节不存在或不属于课程");
    if (lessonId && !tree.chapters.some((chapter) => chapter.lessons.some((lesson) => lesson.id === lessonId))) throw new SchoolServiceError(404, "课时不存在或不属于课程");
}

async function assertTeachingTarget(repository: SchoolDomainRepository, schoolId: string, assignmentId: string, chapterId?: string, lessonId?: string) {
    if (chapterId && lessonId) throw new SchoolServiceError(400, "教学任务只能关联章节或课时");
    if (!chapterId && !lessonId) return;
    const assignment = await repository.getSchoolCourseAssignment(schoolId, assignmentId);
    const courseId = assignment?.courseId;
    if (!courseId) return;
    const tree = await repository.getPlatformCourseTree(courseId);
    if (!tree) throw new SchoolServiceError(404, "课程不存在");
    if (chapterId && !tree.chapters.some((chapter) => chapter.id === chapterId)) throw new SchoolServiceError(400, "教学任务章节不属于课程");
    if (lessonId && !tree.chapters.some((chapter) => chapter.lessons.some((lesson) => lesson.id === lessonId))) throw new SchoolServiceError(400, "教学任务课时不属于课程");
}

async function materialRecord(
    repository: SchoolDomainRepository,
    ownerUserId: string,
    courseId: string,
    input: { chapterId?: string; lessonId?: string; title: string; storageKey: string; sortOrder?: number },
    sourceScope: "platform" | "school",
    schoolCourseAssignmentId?: string,
): Promise<CourseMaterialRecord> {
    const storageKey = text(input.storageKey, 1000);
    const registration = (await getLocalMediaRegistrations([storageKey], { ownerUserId }))[0];
    if (!registration || registration.storageClass !== "permanent" || registration.type !== "attachment" || registration.source !== "course-attachment") throw new SchoolServiceError(400, "课程资料文件不存在或无权使用");
    return {
        id: randomUUID(),
        courseId,
        ...(input.chapterId ? { chapterId: input.chapterId } : {}),
        ...(input.lessonId ? { lessonId: input.lessonId } : {}),
        sourceScope,
        ...(schoolCourseAssignmentId ? { schoolCourseAssignmentId } : {}),
        title: requiredText(input.title, "资料标题", 260),
        fileName: registration.originalName || storageKey.split("/").pop() || "课程资料",
        mimeType: registration.mimeType,
        bytes: registration.bytes,
        storageKey,
        url: `/api/reference-assets/${storageKey
            .split("/")
            .map((part) => encodeURIComponent(part))
            .join("/")}`,
        sortOrder: positiveOrder(input.sortOrder),
        status: "active",
        createdByUserId: ownerUserId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
}

async function assertSchoolMaterialManager(repository: SchoolDomainRepository, schoolId: string, membershipId: string, canManageSchool: boolean, assignmentId?: string) {
    if (canManageSchool) return;
    if (!assignmentId) throw new SchoolServiceError(403, "当前老师不是该课程负责人");
    if (!(await repository.hasActiveOfferingForTeacher(schoolId, membershipId, assignmentId))) throw new SchoolServiceError(403, "当前老师不是该课程负责人");
}

function positiveOrder(value: unknown) {
    return Number.isFinite(Number(value)) && Number(value) >= 0 ? Math.floor(Number(value)) : 0;
}

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function objectValue(value: unknown): JsonValue {
    return value && typeof value === "object" && !Array.isArray(value) ? (structuredClone(value as Record<string, unknown>) as JsonValue) : {};
}

function arrayValue(value: unknown): JsonValue {
    return Array.isArray(value) ? (structuredClone(value) as JsonValue) : [];
}

function dueAtValue(value: unknown) {
    if (typeof value !== "string") throw new SchoolServiceError(400, "截止时间无效");
    const normalized = value.trim();
    if (!normalized) return "";
    if (!/(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized) || Number.isNaN(Date.parse(normalized))) throw new SchoolServiceError(400, "截止时间必须包含明确时区");
    return new Date(normalized).toISOString();
}

function normalizePositiveInteger(value: number | undefined, fallback: number) {
    return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}

function isPlatformCourseStatus(value: unknown): value is PlatformCourseStatus {
    return value === "draft" || value === "published" || value === "disabled";
}

function isSchoolStatus(value: unknown): value is "active" | "disabled" {
    return value === "active" || value === "disabled";
}

function isTeachingAssignmentKind(value: unknown): value is TeachingAssignmentKind {
    return value === "lesson" || value === "homework" || value === "commercial_practice";
}

function isTeachingAssignmentStatus(value: unknown): value is TeachingAssignmentStatus {
    return value === "draft" || value === "published" || value === "closed";
}
