import { randomUUID } from "node:crypto";

import { ensurePostgresSchema, isPostgresDatabaseEnabled } from "@/lib/server/database/postgres";
import { createSchoolDomainRepository } from "@/lib/server/school-domain-repository";
import { requireTeacher, SchoolServiceError } from "@/lib/server/school-access-service";
import { createTeachingLessonPlanRepository, type LessonPlanKey, type LessonPlanRecord } from "@/lib/server/teaching-lesson-plan-repository";
import { createPlatformLessonTemplateRepository, toLessonTemplate } from "@/lib/server/platform-lesson-template-repository";
import {
    isLessonPlanStatus,
    lessonPlanMissingItems,
    lessonPlanTotalMinutes,
    normalizeLessonPlanContent,
    normalizeLessonPlanRehearsal,
    type LessonPlanRehearsalInput,
    type LessonPlanSaveInput,
    type PlatformLessonTemplate,
    type TeachingLessonPlan,
    type TeachingLessonPlanSummary,
} from "@/lib/teaching-lesson-plan";

/*
 * 老师自己的备课教案。只有学校老师能用，按「本校已开放的课程 × 该课程的课时」校验，
 * 不要求这门课已经排到老师的班级——备课是老师自己的事，排课前也能先备。
 */

async function prepare() {
    if (isPostgresDatabaseEnabled()) await ensurePostgresSchema();
}

/** 课程必须是本校启用中的课程，课时必须属于这门课 */
async function resolveLessonKey(userId: string, assignmentId: string, lessonId: string): Promise<LessonPlanKey> {
    const context = await requireTeacher(userId);
    const repository = createSchoolDomainRepository();
    const assignment = await repository.getSchoolCourseAssignment(context.school.id, assignmentId);
    if (!assignment || assignment.status !== "active") throw new SchoolServiceError(404, "学校课程不存在");
    const lesson = await repository.getCourseLesson(lessonId);
    if (!lesson || lesson.courseId !== assignment.courseId) throw new SchoolServiceError(404, "课时不存在");
    return { schoolId: context.school.id, assignmentId, lessonId, teacherMembershipId: context.membership.id };
}

function toLessonPlan(record: LessonPlanRecord): TeachingLessonPlan {
    return {
        id: record.id,
        assignmentId: record.assignmentId,
        lessonId: record.lessonId,
        status: record.status,
        content: record.content,
        lastRehearsal: record.lastRehearsal,
        rehearsalCount: record.rehearsalCount,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

function toSummary(record: LessonPlanRecord): TeachingLessonPlanSummary {
    return { assignmentId: record.assignmentId, lessonId: record.lessonId, status: record.status, rehearsalCount: record.rehearsalCount, updatedAt: record.updatedAt, totalMinutes: lessonPlanTotalMinutes(record.content) };
}

/** 版本号必须是可解析的时间；统一成 ISO 字符串，两种存储后端按同一格式比较 */
function parseBaseVersion(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const time = typeof value === "string" ? new Date(value).getTime() : Number.NaN;
    if (Number.isNaN(time)) throw new SchoolServiceError(400, "教案版本无效");
    return new Date(time).toISOString();
}

/** 我的备课进度：不带教案正文，可按课程过滤 */
export async function listMyLessonPlans(userId: string, assignmentId?: string): Promise<TeachingLessonPlanSummary[]> {
    await prepare();
    const context = await requireTeacher(userId);
    const records = await createTeachingLessonPlanRepository().listPlans(context.school.id, context.membership.id, assignmentId?.trim() || undefined);
    return records.map(toSummary);
}

/** 课程方给这节课写的标准教案（只读参考）；没有返回 null */
export async function getLessonTemplateForTeacher(userId: string, assignmentId: string, lessonId: string): Promise<PlatformLessonTemplate | null> {
    await prepare();
    const key = await resolveLessonKey(userId, assignmentId, lessonId);
    // 停用的课程分配可能仍是 active，和学校课程树一致：只有已发布的课程才对老师可见
    const repository = createSchoolDomainRepository();
    const lesson = await repository.getCourseLesson(key.lessonId);
    const course = lesson ? await repository.getPlatformCourse(lesson.courseId) : null;
    if (!course || course.status !== "published") return null;
    const record = await createPlatformLessonTemplateRepository().getTemplate(key.lessonId);
    return record ? toLessonTemplate(record) : null;
}

/** 读一节课的教案；还没写过返回 null，由前端给起步模板 */
export async function getMyLessonPlan(userId: string, assignmentId: string, lessonId: string): Promise<TeachingLessonPlan | null> {
    await prepare();
    const key = await resolveLessonKey(userId, assignmentId, lessonId);
    const record = await createTeachingLessonPlanRepository().getPlan(key);
    return record ? toLessonPlan(record) : null;
}

/**
 * 保存教案。baseUpdatedAt = 编辑器打开时的版本（新建传 null）；版本对不上报 409，前端提示重新载入。
 * status=ready（标记已备课）时教案必须补齐必填项，否则 400 并在 data.missing 里返回缺什么。
 */
export async function saveMyLessonPlan(userId: string, assignmentId: string, lessonId: string, input: LessonPlanSaveInput): Promise<TeachingLessonPlan> {
    await prepare();
    const key = await resolveLessonKey(userId, assignmentId, lessonId);
    const status = input.status === undefined ? "draft" : input.status;
    if (!isLessonPlanStatus(status)) throw new SchoolServiceError(400, "备课状态无效");
    const base = parseBaseVersion(input.baseUpdatedAt);
    const content = normalizeLessonPlanContent(input.content);
    if (status === "ready") {
        const missing = lessonPlanMissingItems(content);
        if (missing.length) throw new SchoolServiceError(400, `还不能标记已备课：${missing[0]}`, { missing });
    }
    const now = new Date().toISOString();
    const saved = await createTeachingLessonPlanRepository().savePlan({ id: randomUUID(), ...key, status, content, lastRehearsal: null, rehearsalCount: 0, createdAt: now, updatedAt: now }, base);
    if (!saved) throw new SchoolServiceError(409, "这份教案已在别处修改，请重新载入后再保存");
    return toLessonPlan(saved);
}

/** 记一次试讲（老师自己计时演练，不涉及班级和学生）；教案需先保存过 */
export async function recordMyLessonRehearsal(userId: string, assignmentId: string, lessonId: string, input: LessonPlanRehearsalInput): Promise<TeachingLessonPlan> {
    await prepare();
    const key = await resolveLessonKey(userId, assignmentId, lessonId);
    const repository = createTeachingLessonPlanRepository();
    const current = await repository.getPlan(key);
    if (!current) throw new SchoolServiceError(409, "请先保存教案再试讲");
    const rehearsal = normalizeLessonPlanRehearsal(input, current.content, new Date().toISOString());
    if (!rehearsal.totalSeconds) throw new SchoolServiceError(400, "试讲时长无效");
    const updated = await repository.recordRehearsal(key, rehearsal);
    if (!updated) throw new SchoolServiceError(409, "请先保存教案再试讲");
    return toLessonPlan(updated);
}
