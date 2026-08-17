import { randomUUID } from "node:crypto";

import { hasAdminPermission } from "@/lib/admin-permissions";
import { getPublicUsersByIds } from "@/lib/auth/store";
import {
    canTransitionCommercialOrder,
    type AdminCommercialOrder,
    type AdminCommercialOrderDetails,
    type CommercialOrderDelivery,
    type CommercialOrderInput,
    type CommercialOrderParticipantSubmission,
    type CommercialOrderStatus,
    type PageResult,
    type SchoolCommercialOrder,
    type SchoolContentReference,
    type SchoolPublicIdentity,
} from "@/lib/school-domain";
import type { CommercialOrderDeliveryRecord, CommercialOrderParticipantRecord, CommercialOrderRecord, OrderPageQuery, SchoolDomainRepository, SchoolMembershipRecord } from "@/lib/server/school-domain-repository";
import type { JsonValue } from "@/lib/server/database/repository-types";
import { createSchoolDomainRepository } from "@/lib/server/school-domain-repository";
import { requireActiveSchoolContext, requireSchoolManager, requireStudent, requireTeacher, SchoolServiceError } from "./school-access-service";
import { validateSchoolContentReferences } from "./school-content-reference-service";

type PageInput = { page?: number; pageSize?: number };
type ConfigurationInput = { teacherMembershipId: string; classId?: string; participantMembershipIds: string[] };

export async function listPlatformCommercialOrders(actorId: string, input: OrderPageQuery = {}): Promise<PageResult<AdminCommercialOrder>> {
    await requireEducationAdmin(actorId);
    const result = await createSchoolDomainRepository().listPlatformCommercialOrders(input);
    return { ...result, items: result.items.map(toAdminOrder) };
}

export async function getPlatformCommercialOrder(actorId: string, orderId: string): Promise<AdminCommercialOrder> {
    await requireEducationAdmin(actorId);
    const order = await createSchoolDomainRepository().getPlatformCommercialOrder(orderId);
    if (!order) throw new SchoolServiceError(404, "商单不存在");
    return toAdminOrder(order);
}

export async function getPlatformCommercialOrderDetails(actorId: string, orderId: string, input: PageInput = {}): Promise<AdminCommercialOrderDetails> {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    const order = await repository.getPlatformCommercialOrder(orderId);
    if (!order) throw new SchoolServiceError(404, "商单不存在");
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(100, positiveInteger(input.pageSize, 20));
    const deliveries = order.assignedSchoolId ? await repository.listCommercialOrderDeliveries(order.assignedSchoolId, orderId, { page, pageSize }) : { items: [], total: 0, page, pageSize };
    return { order: toAdminOrder(order), deliveries: await mapPage(deliveries, (record) => toDelivery(repository, record)) };
}

export async function createCommercialOrder(actorId: string, input: CommercialOrderInput): Promise<AdminCommercialOrder> {
    await requireEducationAdmin(actorId);
    const now = new Date().toISOString();
    const record: CommercialOrderRecord = {
        id: randomUUID(),
        title: requiredText(input.title, "商单标题", 160),
        requirements: text(input.requirements, 5000),
        referenceMaterials: arrayValue(input.referenceMaterials),
        acceptanceCriteria: text(input.acceptanceCriteria, 5000),
        internalAmountCents: amountValue(input.internalAmountCents),
        ...(input.deadlineAt ? { deadlineAt: dueAtValue(input.deadlineAt) } : {}),
        status: "draft",
        platformFeedback: "",
        createdByUserId: actorId,
        createdAt: now,
        updatedAt: now,
    };
    return toAdminOrder(await createSchoolDomainRepository().insertCommercialOrder(record));
}

export async function updateCommercialOrder(actorId: string, orderId: string, input: Partial<CommercialOrderInput>): Promise<AdminCommercialOrder> {
    await requireEducationAdmin(actorId);
    const patch = {
        ...(input.title === undefined ? {} : { title: requiredText(input.title, "商单标题", 160) }),
        ...(input.requirements === undefined ? {} : { requirements: text(input.requirements, 5000) }),
        ...(input.referenceMaterials === undefined ? {} : { referenceMaterials: arrayValue(input.referenceMaterials) }),
        ...(input.acceptanceCriteria === undefined ? {} : { acceptanceCriteria: text(input.acceptanceCriteria, 5000) }),
        ...(input.internalAmountCents === undefined ? {} : { internalAmountCents: amountValue(input.internalAmountCents) }),
        ...(input.deadlineAt === undefined ? {} : { deadlineAt: input.deadlineAt ? dueAtValue(input.deadlineAt) : "" }),
        updatedAt: new Date().toISOString(),
    };
    const updated = await createSchoolDomainRepository().updateCommercialOrderDraft(orderId, patch);
    if (!updated) throw new SchoolServiceError(409, "只有草稿商单可以修改");
    return toAdminOrder(updated);
}

export async function assignCommercialOrder(actorId: string, orderId: string, schoolId: string): Promise<AdminCommercialOrder> {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    const assigned = await repository.transact(async (transaction) => {
        const [order, school] = await Promise.all([transaction.getPlatformCommercialOrder(orderId, true), transaction.getSchool(schoolId, true)]);
        if (!order) throw new SchoolServiceError(404, "商单不存在");
        if (!school || school.status !== "active") throw new SchoolServiceError(404, "学校不存在或已停用");
        if (order.status !== "draft" && order.status !== "assigned") throw new SchoolServiceError(409, "商单开始制作后不能直接换校");
        if (order.status === "assigned" && order.assignedSchoolId === schoolId) return order;
        const result = await transaction.assignCommercialOrderToSchool(orderId, schoolId, new Date().toISOString());
        if (!result) throw new SchoolServiceError(409, "商单状态已变化，请刷新后重试");
        return result;
    });
    return toAdminOrder(assigned);
}

export async function cancelCommercialOrder(actorId: string, orderId: string): Promise<AdminCommercialOrder> {
    await requireEducationAdmin(actorId);
    const repository = createSchoolDomainRepository();
    const cancelled = await repository.transact(async (transaction) => {
        const order = await transaction.getPlatformCommercialOrder(orderId, true);
        if (!order) throw new SchoolServiceError(404, "商单不存在");
        if (!canTransitionCommercialOrder(order.status, "cancelled")) throw new SchoolServiceError(409, "当前商单状态不能取消");
        const now = new Date().toISOString();
        if (!(await transaction.compareAndSetPlatformCommercialOrderStatus(orderId, order.status, "cancelled", now))) throw new SchoolServiceError(409, "商单状态已变化，请刷新后重试");
        return { ...order, status: "cancelled" as const, updatedAt: now };
    });
    return toAdminOrder(cancelled);
}

export async function listSchoolCommercialOrders(managerId: string, input: OrderPageQuery = {}): Promise<PageResult<SchoolCommercialOrder>> {
    const context = await requireSchoolManager(managerId);
    const repository = createSchoolDomainRepository();
    return mapOrderPage(repository, context.school.id, await repository.listCommercialOrders(context.school.id, input));
}

export async function getSchoolCommercialOrder(managerId: string, orderId: string): Promise<SchoolCommercialOrder> {
    const context = await requireSchoolManager(managerId);
    const repository = createSchoolDomainRepository();
    const order = await repository.getCommercialOrder(context.school.id, orderId);
    if (!order) throw new SchoolServiceError(404, "商单不存在");
    return toSchoolOrder(repository, context.school.id, order);
}

export async function configureCommercialOrder(managerId: string, orderId: string, input: ConfigurationInput): Promise<SchoolCommercialOrder> {
    const context = await requireSchoolManager(managerId);
    const repository = createSchoolDomainRepository();
    const participantIds = normalizeIds(input.participantMembershipIds);
    const configured = await repository.transact(async (transaction) => {
        const order = await transaction.getCommercialOrder(context.school.id, orderId, true);
        if (!order) throw new SchoolServiceError(404, "商单不存在");
        if (order.status !== "assigned") throw new SchoolServiceError(409, "只有待配置商单可以安排制作团队");
        const teacher = await transaction.getMembership(context.school.id, input.teacherMembershipId, true);
        if (!teacher || teacher.role !== "teacher" || teacher.status !== "active") throw new SchoolServiceError(404, "负责老师不存在或不可用");
        const schoolClass = input.classId ? await transaction.getClass(context.school.id, input.classId, true) : null;
        if (input.classId && (!schoolClass || schoolClass.status !== "active")) throw new SchoolServiceError(404, "班级不存在或不可用");
        const now = new Date().toISOString();
        const participants = await buildParticipantRecords(transaction, context.school.id, orderId, input.classId, participantIds, now);
        const updated = await transaction.configureCommercialOrder(context.school.id, orderId, { teacherMembershipId: teacher.id, classId: input.classId, updatedAt: now });
        if (!updated) throw new SchoolServiceError(409, "商单状态已变化，请刷新后重试");
        await transaction.replaceCommercialOrderParticipants(context.school.id, orderId, participants);
        return updated;
    });
    return toSchoolOrder(repository, context.school.id, configured);
}

export async function configureCommercialOrderParticipants(teacherId: string, orderId: string, participantMembershipIds: string[]): Promise<PageResult<CommercialOrderParticipantSubmission>> {
    const context = await requireTeacher(teacherId);
    const repository = createSchoolDomainRepository();
    const participantIds = normalizeIds(participantMembershipIds);
    const participants = await repository.transact(async (transaction) => {
        const order = await transaction.getCommercialOrder(context.school.id, orderId, true);
        if (!order || order.teacherMembershipId !== context.membership.id) throw new SchoolServiceError(404, "商单不存在或无权安排参与学生");
        if (order.status !== "assigned") throw new SchoolServiceError(409, "商单开始制作后不能调整参与学生");
        const teacher = await transaction.getMembership(context.school.id, context.membership.id, true);
        if (!teacher || teacher.role !== "teacher" || teacher.status !== "active") throw new SchoolServiceError(403, "当前账号没有可用的老师身份");
        const now = new Date().toISOString();
        const records = await buildParticipantRecords(transaction, context.school.id, orderId, order.classId, participantIds, now);
        await transaction.replaceCommercialOrderParticipants(context.school.id, orderId, records);
        return records;
    });
    return mapPage({ items: participants, total: participants.length, page: 1, pageSize: Math.max(20, participants.length) }, (record) => toParticipant(repository, record));
}

export async function startCommercialOrder(managerId: string, orderId: string): Promise<SchoolCommercialOrder> {
    const context = await requireSchoolManager(managerId);
    const repository = createSchoolDomainRepository();
    const started = await repository.transact(async (transaction) => {
        const order = await transaction.getCommercialOrder(context.school.id, orderId, true);
        if (!order) throw new SchoolServiceError(404, "商单不存在");
        if (order.status !== "assigned") throw new SchoolServiceError(409, "只有已分配商单可以开始制作");
        if (!order.teacherMembershipId) throw new SchoolServiceError(409, "请先指定负责老师");
        const teacher = await transaction.getMembership(context.school.id, order.teacherMembershipId, true);
        if (!teacher || teacher.role !== "teacher" || teacher.status !== "active") throw new SchoolServiceError(409, "负责老师已不可用，请重新配置制作团队");
        if (order.classId) {
            const schoolClass = await transaction.getClass(context.school.id, order.classId, true);
            if (!schoolClass || schoolClass.status !== "active") throw new SchoolServiceError(409, "参与班级已不可用，请重新配置制作团队");
        }
        if (!(await transaction.hasActiveCommercialOrderParticipant(context.school.id, orderId))) throw new SchoolServiceError(409, "请先安排至少一名可用的参与学生");
        const now = new Date().toISOString();
        if (!(await transaction.compareAndSetCommercialOrderStatus(context.school.id, orderId, "assigned", "in_progress", now))) throw new SchoolServiceError(409, "商单状态已变化，请刷新后重试");
        return { ...order, status: "in_progress" as const, updatedAt: now };
    });
    return toSchoolOrder(repository, context.school.id, started);
}

export async function listTeachingCommercialOrders(userId: string, input: OrderPageQuery = {}): Promise<PageResult<SchoolCommercialOrder>> {
    const context = await requireActiveSchoolContext(userId);
    const repository = createSchoolDomainRepository();
    const result =
        context.membership.role === "teacher" ? await repository.listCommercialOrdersForTeacher(context.school.id, context.membership.id, input) : await repository.listCommercialOrdersForParticipant(context.school.id, context.membership.id, input);
    return mapOrderPage(repository, context.school.id, result);
}

export async function listCommercialOrderSubmissions(userId: string, orderId: string, input: PageInput = {}) {
    const context = await requireActiveSchoolContext(userId);
    const repository = createSchoolDomainRepository();
    const order = await repository.getCommercialOrder(context.school.id, orderId);
    if (!order) throw new SchoolServiceError(404, "商单不存在");
    if (context.membership.role === "teacher" && order.teacherMembershipId !== context.membership.id && !context.canManageSchool) throw new SchoolServiceError(404, "商单不存在或无权访问");
    const ownParticipant = context.membership.role === "student" ? await repository.getCommercialOrderParticipant(context.school.id, orderId, context.membership.id) : null;
    if (context.membership.role === "student" && !ownParticipant) throw new SchoolServiceError(404, "商单不存在或无权访问");
    const participants = context.membership.role === "teacher" ? await repository.listCommercialOrderParticipants(context.school.id, orderId, input) : singleItemPage(ownParticipant!, input);
    const deliveries = await repository.listCommercialOrderDeliveries(context.school.id, orderId, input);
    return {
        order: await toSchoolOrder(repository, context.school.id, order),
        participants: await mapPage(participants, (record) => toParticipant(repository, record)),
        deliveries: await mapPage(deliveries, (record) => toDelivery(repository, record)),
    };
}

export async function submitCommercialOrderWork(userId: string, orderId: string, input: { note?: string; references: unknown }): Promise<CommercialOrderParticipantSubmission> {
    const context = await requireStudent(userId);
    const references = (await validateSchoolContentReferences({ userId, schoolId: context.school.id, references: input.references })).map((item) => item.reference);
    const repository = createSchoolDomainRepository();
    const participant = await repository.transact(async (transaction) => {
        const order = await requireWritableOrder(transaction, context.school.id, orderId, ["in_progress", "revision_required"]);
        const student = await transaction.getMembership(context.school.id, context.membership.id, true);
        if (!student || student.role !== "student" || student.status !== "active") throw new SchoolServiceError(403, "当前账号没有可用的学生身份");
        const current = await transaction.getCommercialOrderParticipant(context.school.id, order.id, student.id, true);
        if (!current) throw new SchoolServiceError(404, "商单不存在或未安排当前学生参与");
        const now = new Date().toISOString();
        const updated = await transaction.updateCommercialOrderParticipant(context.school.id, order.id, student.id, { candidateReferences: references, note: text(input.note, 2000), status: "submitted", submittedAt: now, updatedAt: now });
        if (!updated) throw new SchoolServiceError(409, "商单参与状态已变化，请刷新后重试");
        return updated;
    });
    return toParticipant(repository, participant);
}

export async function submitCommercialOrderDelivery(userId: string, orderId: string, input: { note?: string; references: unknown }): Promise<CommercialOrderDelivery> {
    const context = await requireTeacher(userId);
    const references = (await validateSchoolContentReferences({ userId, schoolId: context.school.id, references: input.references })).map((item) => item.reference);
    if (!references.length) throw new SchoolServiceError(400, "正式交付至少需要一项成果引用");
    const repository = createSchoolDomainRepository();
    const delivery = await repository.transact(async (transaction) => {
        const order = await requireWritableOrder(transaction, context.school.id, orderId, ["in_progress", "revision_required"]);
        if (order.teacherMembershipId !== context.membership.id) throw new SchoolServiceError(404, "商单不存在或无权提交");
        const teacher = await transaction.getMembership(context.school.id, context.membership.id, true);
        if (!teacher || teacher.role !== "teacher" || teacher.status !== "active") throw new SchoolServiceError(403, "当前账号没有可用的老师身份");
        const now = new Date().toISOString();
        const created = await transaction.insertCommercialOrderDelivery({
            id: randomUUID(),
            schoolId: context.school.id,
            orderId,
            submittedByMembershipId: teacher.id,
            contentReferences: references,
            note: text(input.note, 2000),
            status: "submitted",
            platformFeedback: "",
            submittedAt: now,
            createdAt: now,
            updatedAt: now,
        });
        if (!(await transaction.compareAndSetCommercialOrderStatus(context.school.id, orderId, order.status, "submitted", now))) throw new SchoolServiceError(409, "商单状态已变化，请刷新后重试");
        return created;
    });
    return toDelivery(repository, delivery);
}

export async function reviewCommercialOrder(actorId: string, orderId: string, input: { decision: "revision_required" | "accepted"; feedback?: string }): Promise<AdminCommercialOrder> {
    await requireEducationAdmin(actorId);
    if (input.decision !== "revision_required" && input.decision !== "accepted") throw new SchoolServiceError(400, "验收决定无效");
    const feedback = text(input.feedback, 5000);
    if (input.decision === "revision_required" && !feedback) throw new SchoolServiceError(400, "退回修改时必须填写反馈");
    const repository = createSchoolDomainRepository();
    const reviewed = await repository.transact(async (transaction) => {
        const order = await transaction.getPlatformCommercialOrder(orderId, true);
        if (!order) throw new SchoolServiceError(404, "商单不存在");
        if (order.status !== "submitted") throw new SchoolServiceError(409, "只有待验收商单可以审核");
        const delivery = await transaction.getLatestCommercialOrderDelivery(orderId, true);
        if (!delivery || delivery.orderId !== orderId || delivery.status !== "submitted") throw new SchoolServiceError(409, "商单没有可审核的最新正式交付");
        const now = new Date().toISOString();
        const updatedDelivery = await transaction.updateCommercialOrderDelivery(delivery.id, { status: input.decision, platformFeedback: feedback, reviewedAt: now, updatedAt: now });
        if (!updatedDelivery) throw new SchoolServiceError(409, "正式交付状态已变化，请刷新后重试");
        if (!(await transaction.compareAndSetPlatformCommercialOrderStatus(orderId, "submitted", input.decision, now, feedback))) throw new SchoolServiceError(409, "商单状态已变化，请刷新后重试");
        return { ...order, status: input.decision, platformFeedback: feedback, updatedAt: now };
    });
    return toAdminOrder(reviewed);
}

async function requireWritableOrder(repository: SchoolDomainRepository, schoolId: string, orderId: string, statuses: CommercialOrderStatus[]) {
    const order = await repository.getCommercialOrder(schoolId, orderId, true);
    if (!order) throw new SchoolServiceError(404, "商单不存在");
    if (!statuses.includes(order.status)) throw new SchoolServiceError(409, order.status === "accepted" ? "已验收商单不能再次提交" : "当前商单状态不能提交成果");
    return order;
}

function toAdminOrder(record: CommercialOrderRecord): AdminCommercialOrder {
    return {
        id: record.id,
        title: record.title,
        requirements: record.requirements,
        referenceMaterials: Array.isArray(record.referenceMaterials) ? record.referenceMaterials : [],
        acceptanceCriteria: record.acceptanceCriteria,
        internalAmountCents: record.internalAmountCents,
        ...(record.deadlineAt ? { deadlineAt: record.deadlineAt } : {}),
        ...(record.assignedSchoolId ? { assignedSchoolId: record.assignedSchoolId } : {}),
        ...(record.teacherMembershipId ? { teacherMembershipId: record.teacherMembershipId } : {}),
        ...(record.classId ? { classId: record.classId } : {}),
        status: record.status,
        platformFeedback: record.platformFeedback,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

async function toSchoolOrder(repository: SchoolDomainRepository, schoolId: string, record: CommercialOrderRecord): Promise<SchoolCommercialOrder> {
    if (!record.assignedSchoolId || record.assignedSchoolId !== schoolId) throw new SchoolServiceError(404, "商单不存在");
    const [teacherMembership, schoolClass] = await Promise.all([record.teacherMembershipId ? repository.getMembership(schoolId, record.teacherMembershipId) : null, record.classId ? repository.getClass(schoolId, record.classId) : null]);
    return {
        id: record.id,
        title: record.title,
        requirements: record.requirements,
        referenceMaterials: Array.isArray(record.referenceMaterials) ? record.referenceMaterials : [],
        acceptanceCriteria: record.acceptanceCriteria,
        ...(record.deadlineAt ? { deadlineAt: record.deadlineAt } : {}),
        assignedSchoolId: schoolId,
        ...(record.teacherMembershipId ? { teacherMembershipId: record.teacherMembershipId, teacher: await toPublicIdentity(teacherMembership) } : {}),
        ...(record.classId ? { classId: record.classId, className: schoolClass?.name || "班级信息不可用" } : {}),
        status: record.status,
        platformFeedback: record.platformFeedback,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

async function toParticipant(repository: SchoolDomainRepository, record: CommercialOrderParticipantRecord): Promise<CommercialOrderParticipantSubmission> {
    const membership = await repository.getMembership(record.schoolId, record.membershipId);
    return {
        id: record.id,
        orderId: record.orderId,
        membershipId: record.membershipId,
        participant: await toPublicIdentity(membership),
        candidateReferences: referenceArray(record.candidateReferences),
        note: record.note,
        status: record.status,
        ...(record.submittedAt ? { submittedAt: record.submittedAt } : {}),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

async function toDelivery(repository: SchoolDomainRepository, record: CommercialOrderDeliveryRecord): Promise<CommercialOrderDelivery> {
    const membership = await repository.getMembership(record.schoolId, record.submittedByMembershipId);
    return {
        id: record.id,
        orderId: record.orderId,
        submittedByMembershipId: record.submittedByMembershipId,
        submittedBy: await toPublicIdentity(membership),
        contentReferences: referenceArray(record.contentReferences),
        note: record.note,
        status: record.status,
        platformFeedback: record.platformFeedback,
        submittedAt: record.submittedAt,
        ...(record.reviewedAt ? { reviewedAt: record.reviewedAt } : {}),
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

async function toPublicIdentity(membership: SchoolMembershipRecord | null): Promise<SchoolPublicIdentity> {
    if (!membership?.userId) return { accountId: "", username: "", displayName: "成员信息不可用" };
    const user = (await getPublicUsersByIds([membership.userId]))[0];
    return { accountId: user?.accountId || "", username: user?.username || "", displayName: user?.displayName || "成员信息不可用" };
}

async function mapOrderPage(repository: SchoolDomainRepository, schoolId: string, page: { items: CommercialOrderRecord[]; total: number; page: number; pageSize: number }) {
    return mapPage(page, (record) => toSchoolOrder(repository, schoolId, record));
}

async function mapPage<T, U>(page: { items: T[]; total: number; page: number; pageSize: number }, mapper: (item: T) => Promise<U>) {
    return { ...page, items: await Promise.all(page.items.map(mapper)) };
}

function singleItemPage<T>(item: T, input: PageInput) {
    const page = positiveInteger(input.page, 1);
    const pageSize = Math.min(100, positiveInteger(input.pageSize, 20));
    return { items: page === 1 ? [item] : [], total: 1, page, pageSize };
}

async function requireEducationAdmin(actorId: string) {
    const actor = (await getPublicUsersByIds([actorId]))[0];
    if (!hasAdminPermission(actor, "education.manage")) throw new SchoolServiceError(403, "当前管理员没有产教运营职责权限");
}

function requiredText(value: unknown, label: string, max: number) {
    const result = text(value, max);
    if (!result) throw new SchoolServiceError(400, `请填写${label}`);
    return result;
}

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function arrayValue(value: unknown): JsonValue {
    return Array.isArray(value) ? (structuredClone(value) as JsonValue) : [];
}

function referenceArray(value: unknown): SchoolContentReference[] {
    return Array.isArray(value) ? (structuredClone(value) as SchoolContentReference[]) : [];
}

function amountValue(value: unknown) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new SchoolServiceError(400, "内部金额必须是非负安全整数");
    return value;
}

function dueAtValue(value: unknown) {
    if (typeof value !== "string" || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value.trim()) || Number.isNaN(Date.parse(value))) throw new SchoolServiceError(400, "截止时间必须包含明确时区");
    return new Date(value).toISOString();
}

function positiveInteger(value: number | undefined, fallback: number) {
    return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : fallback;
}

function normalizeIds(values: string[] | undefined) {
    return [...new Set((values || []).map((value) => (typeof value === "string" ? value.trim() : "")).filter(Boolean))];
}

async function buildParticipantRecords(repository: SchoolDomainRepository, schoolId: string, orderId: string, classId: string | undefined, membershipIds: string[], now: string) {
    const participants: CommercialOrderParticipantRecord[] = [];
    for (const membershipId of membershipIds) {
        const membership = await repository.getMembership(schoolId, membershipId, true);
        if (!membership || membership.role !== "student" || membership.status !== "active") throw new SchoolServiceError(404, "参与学生不存在或不可用");
        if (classId && !(await repository.isClassMember(schoolId, classId, membershipId))) throw new SchoolServiceError(409, "参与学生不属于所选班级");
        participants.push({ id: randomUUID(), schoolId, orderId, membershipId, candidateReferences: [], note: "", status: "active", createdAt: now, updatedAt: now });
    }
    return participants;
}
