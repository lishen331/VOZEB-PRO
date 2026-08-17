import { randomUUID } from "node:crypto";

import { hasAdminPermission } from "@/lib/admin-permissions";
import { getPublicUsersByIds } from "@/lib/auth/store";
import type {
    CourseOfferingInput,
    PageResult,
    PlatformCourse,
    PlatformCourseInput,
    PlatformCoursePatch,
    PlatformCourseStatus,
    SchoolCourseAssignment,
    SchoolCourseOffering,
    TeachingAssignment,
    TeachingAssignmentInput,
    TeachingAssignmentKind,
    TeachingAssignmentStatus,
    TeachingSubmission,
} from "@/lib/school-domain";
import type { PlatformCourseRecord, SchoolDomainRepository } from "@/lib/server/school-domain-repository";
import type { JsonValue } from "@/lib/server/database/repository-types";
import { createSchoolDomainRepository } from "@/lib/server/school-domain-repository";
import { validateSchoolContentReferences } from "./school-content-reference-service";
import { requireActiveSchoolContext, requireSchoolManager, requireStudent, requireTeacher, SchoolServiceError } from "./school-access-service";

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
        chapters: arrayValue(input.chapters),
        attachments: arrayValue(input.attachments),
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
    if (!(await repository.getPlatformCourse(courseId))) throw new SchoolServiceError(404, "课程不存在");
    const patch = {
        ...(input.title === undefined ? {} : { title: requiredText(input.title, "课程标题", 160) }),
        ...(input.summary === undefined ? {} : { summary: text(input.summary, 500) }),
        ...(input.content === undefined ? {} : { content: objectValue(input.content) }),
        ...(input.chapters === undefined ? {} : { chapters: arrayValue(input.chapters) }),
        ...(input.attachments === undefined ? {} : { attachments: arrayValue(input.attachments) }),
        ...(input.status === undefined ? {} : { status: input.status }),
        updatedAt: new Date().toISOString(),
    };
    const updated = await repository.updatePlatformCourse(courseId, patch);
    if (!updated) throw new SchoolServiceError(404, "课程不存在");
    return toPlatformCourse(updated);
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
    if (!(await repository.getSchoolCourseAssignment(context.school.id, assignmentId))) throw new SchoolServiceError(404, "学校课程不存在");
    return repository.listOfferingsForAssignment(context.school.id, assignmentId, input);
}

export async function createCourseOffering(managerId: string, assignmentId: string, input: CourseOfferingInput): Promise<SchoolCourseOffering> {
    const context = await requireSchoolManager(managerId);
    if (input.status !== undefined && !isSchoolStatus(input.status)) throw new SchoolServiceError(400, "课程安排状态无效");
    const repository = createSchoolDomainRepository();
    return repository.transact(async (transaction) => {
        await requireActiveCourseAssignment(transaction, context.school.id, assignmentId);
        const schoolClass = await transaction.getClass(context.school.id, requiredText(input.classId, "班级", 160), true);
        if (!schoolClass) throw new SchoolServiceError(404, "班级不存在");
        if (schoolClass.status !== "active") throw new SchoolServiceError(409, "班级已停用，不能创建新的教学安排");
        const teacher = await transaction.getMembership(context.school.id, requiredText(input.teacherMembershipId, "负责老师", 160), true);
        if (!teacher || teacher.role !== "teacher" || teacher.status !== "active") throw new SchoolServiceError(400, "负责老师必须是本校可用老师");
        const now = new Date().toISOString();
        return transaction.insertCourseOffering({
            id: randomUUID(),
            schoolId: context.school.id,
            assignmentId,
            classId: schoolClass.id,
            teacherMembershipId: teacher.id,
            supplementalResources: arrayValue(input.supplementalResources),
            status: input.status === "disabled" ? "disabled" : "active",
            createdAt: now,
            updatedAt: now,
        });
    }) as Promise<SchoolCourseOffering>;
}

export async function listTeachingOfferings(teacherId: string, input: { page?: number; pageSize?: number }) {
    const context = await requireTeacher(teacherId);
    return createSchoolDomainRepository().listOfferingsForTeacher(context.school.id, context.membership.id, input);
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
    return repository.transact(async (transaction) => {
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
        const now = new Date().toISOString();
        return transaction.insertTeachingAssignment({
            id: randomUUID(),
            schoolId: context.school.id,
            offeringId,
            teacherMembershipId: context.membership.id,
            kind,
            title: requiredText(input.title, "作业标题", 160),
            instructions: text(input.instructions, 5000),
            resources: arrayValue(input.resources),
            dueAt: input.dueAt === undefined ? undefined : dueAtValue(input.dueAt) || undefined,
            status: input.status || "draft",
            createdAt: now,
            updatedAt: now,
        });
    }) as Promise<TeachingAssignment>;
}

export async function listTeachingAssignments(userId: string, input: { page?: number; pageSize?: number }) {
    const context = await requireActiveSchoolContext(userId);
    const repository = createSchoolDomainRepository();
    return context.membership.role === "teacher" ? repository.listAssignmentsForTeacher(context.school.id, context.membership.id, input) : repository.listAssignmentsForStudent(context.school.id, context.membership.id, input);
}

export async function getTeachingAssignment(userId: string, assignmentId: string): Promise<TeachingAssignment> {
    const context = await requireActiveSchoolContext(userId);
    const repository = createSchoolDomainRepository();
    const assignment = await repository.getTeachingAssignment(context.school.id, assignmentId);
    if (!assignment) throw new SchoolServiceError(404, "教学任务不存在");
    if (context.membership.role === "student" && assignment.status !== "published") throw new SchoolServiceError(404, "教学任务不存在");
    const offering = await repository.getCourseOffering(context.school.id, assignment.offeringId);
    if (!offering) throw new SchoolServiceError(404, "课程安排不存在");
    if (context.membership.role === "teacher" && offering.teacherMembershipId !== context.membership.id) throw new SchoolServiceError(404, "教学任务不存在");
    if (context.membership.role === "student" && !(await repository.isClassMember(context.school.id, offering.classId, context.membership.id))) throw new SchoolServiceError(404, "教学任务不存在");
    return assignment as TeachingAssignment;
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
        updatedAt: new Date().toISOString(),
    };
    return repository.transact(async (transaction) => {
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
        const updated = await transaction.updateTeachingAssignment(context.school.id, assignmentId, patch);
        if (!updated) throw new SchoolServiceError(404, "教学任务不存在");
        return updated;
    }) as Promise<TeachingAssignment>;
}

export async function listTeachingSubmissions(userId: string, assignmentId: string, input: { page?: number; pageSize?: number }) {
    const context = await requireActiveSchoolContext(userId);
    const repository = createSchoolDomainRepository();
    if (context.membership.role === "teacher") {
        await assertResponsibleTeacher(repository, context.school.id, context.membership.id, assignmentId);
        return repository.listTeachingSubmissions(context.school.id, assignmentId, input);
    }
    const assignment = await repository.getTeachingAssignment(context.school.id, assignmentId);
    if (!assignment) throw new SchoolServiceError(404, "教学任务不存在");
    const offering = await repository.getCourseOffering(context.school.id, assignment.offeringId);
    if (!offering || !(await repository.isClassMember(context.school.id, offering.classId, context.membership.id))) throw new SchoolServiceError(404, "教学任务不存在");
    const submission = await repository.getTeachingSubmissionByAssignmentAndStudent(context.school.id, assignmentId, context.membership.id);
    const page = normalizePositiveInteger(input.page, 1);
    const pageSize = Math.min(100, normalizePositiveInteger(input.pageSize, 20));
    return { items: page === 1 && submission ? [submission] : [], total: submission ? 1 : 0, page, pageSize };
}

export async function submitTeachingAssignment(studentId: string, assignmentId: string, input: { note?: string; references: unknown }): Promise<TeachingSubmission> {
    const context = await requireStudent(studentId);
    const repository = createSchoolDomainRepository();
    const previews = await validateSchoolContentReferences({ userId: studentId, schoolId: context.school.id, references: input.references });
    const references = previews.map((item) => item.reference);
    return repository.transact(async (transaction) => {
        const assignmentSnapshot = await transaction.getTeachingAssignment(context.school.id, assignmentId);
        if (!assignmentSnapshot) throw new SchoolServiceError(404, "教学任务不存在或暂不可提交");
        const offering = await transaction.getCourseOffering(context.school.id, assignmentSnapshot.offeringId, true);
        if (!offering || offering.status !== "active") throw new SchoolServiceError(404, "教学任务不存在或无权提交");
        const schoolClass = await transaction.getClass(context.school.id, offering.classId, true);
        if (!schoolClass || schoolClass.status !== "active") throw new SchoolServiceError(404, "教学任务不存在或无权提交");
        const student = await transaction.getMembership(context.school.id, context.membership.id, true);
        if (!student || student.role !== "student" || student.status !== "active") throw new SchoolServiceError(403, "当前账号没有可用的学生身份");
        const assignment = await transaction.getTeachingAssignment(context.school.id, assignmentId, true);
        if (!assignment || assignment.offeringId !== offering.id || assignment.status !== "published") throw new SchoolServiceError(404, "教学任务不存在或暂不可提交");
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
    }) as Promise<TeachingSubmission>;
}

export async function reviewTeachingSubmission(teacherId: string, submissionId: string, input: { status: "reviewed" | "revision_required"; feedback: string }): Promise<TeachingSubmission> {
    const context = await requireTeacher(teacherId);
    const repository = createSchoolDomainRepository();
    return repository.transact(async (transaction) => {
        const submission = await transaction.getTeachingSubmission(context.school.id, submissionId, true);
        if (!submission) throw new SchoolServiceError(404, "提交记录不存在");
        await assertResponsibleTeacher(transaction, context.school.id, context.membership.id, submission.assignmentId);
        if (input.status !== "reviewed" && input.status !== "revision_required") throw new SchoolServiceError(400, "批改状态无效");
        const updated = await transaction.updateTeachingSubmission(context.school.id, submissionId, { status: input.status, feedback: text(input.feedback, 5000), reviewedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        if (!updated) throw new SchoolServiceError(404, "提交记录不存在");
        return updated;
    }) as Promise<TeachingSubmission>;
}

async function assertResponsibleTeacher(repository: SchoolDomainRepository, schoolId: string, teacherMembershipId: string, assignmentId: string) {
    const assignment = await repository.getTeachingAssignment(schoolId, assignmentId);
    if (!assignment) throw new SchoolServiceError(404, "教学任务不存在");
    const offering = await repository.getCourseOffering(schoolId, assignment.offeringId);
    if (!offering || offering.teacherMembershipId !== teacherMembershipId) throw new SchoolServiceError(404, "教学任务不存在或无权操作");
    return assignment;
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

function toPlatformCourse(record: PlatformCourseRecord): PlatformCourse {
    return {
        id: record.id,
        title: record.title,
        summary: record.summary,
        content: record.content as Record<string, unknown>,
        chapters: record.chapters as unknown[],
        attachments: record.attachments as unknown[],
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
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
