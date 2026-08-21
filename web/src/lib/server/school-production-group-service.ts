import { randomUUID } from "node:crypto";
import { getPublicUsersByIds } from "@/lib/auth/store-actions";
import type { ProductionGroup, ProductionGroupDetails, ProductionGroupMember, ComputeAllocationRequest, ProductionGroupProject } from "@/lib/school-compute-domain";
import { createSchoolComputeRepository, type ComputeAllocationRequestRecord, type ProductionGroupMemberRecord, type ProductionGroupRecord } from "./school-compute-repository";
import { createSchoolDomainRepository, type SchoolDomainRepository } from "./school-domain-repository";
import { requireActiveSchoolContext, requireSchoolManager, SchoolServiceError } from "./school-access-service";
import { getDatabaseProvider, withPostgresTransaction } from "./database/postgres";
import { readJsonDataFile, withJsonDataFileLocks, writeJsonDataFile } from "./data-adapter";
import { mutateFileSchoolComputeInsideLock, SCHOOL_COMPUTE_DATA_FILE } from "./school-compute-file-repository";
import { mutateFileSchoolDomainInsideLock, SCHOOL_DOMAIN_DATA_FILE } from "./school-domain-file-repository";
import { validateSchoolContentReferences } from "./school-content-reference-service";

type GroupInput = { name: string; description?: string; leaderMembershipId: string; memberMembershipIds: string[] };

export async function createProductionGroup(managerId: string, input: GroupInput): Promise<ProductionGroupDetails> {
    const context = await requireSchoolManager(managerId);
    const name = text(input.name, 120);
    if (!name) throw new SchoolServiceError(400, "请填写制作小组名称");
    const members = normalizeIds(input.memberMembershipIds);
    const leaderId = text(input.leaderMembershipId, 100);
    if (!leaderId || !members.includes(leaderId)) throw new SchoolServiceError(400, "组长必须属于制作小组成员");
    const school = createSchoolDomainRepository();
    await assertActiveMembers(school, context.school.id, members);
    const now = new Date().toISOString();
    const group = await createSchoolComputeRepository().transact(async (repository) => {
        const record: ProductionGroupRecord = { id: randomUUID(), schoolId: context.school.id, name, description: text(input.description, 2000), leaderMembershipId: leaderId, status: "active", schoolPointsBalance: 0, createdAt: now, updatedAt: now };
        const created = await repository.insertGroup(record);
        await repository.replaceGroupMembers(context.school.id, created.id, memberRecords(context.school.id, created.id, members, leaderId, now));
        return created;
    });
    return toDetails(school, group);
}

export async function updateProductionGroup(managerId: string, groupId: string, input: { name?: string; description?: string; status?: ProductionGroup["status"] }): Promise<ProductionGroupDetails> {
    const context = await requireSchoolManager(managerId);
    const compute = createSchoolComputeRepository();
    const current = await compute.getGroup(context.school.id, groupId, true);
    if (!current) throw new SchoolServiceError(404, "制作小组不存在");
    if (input.name !== undefined && !text(input.name, 120)) throw new SchoolServiceError(400, "请填写制作小组名称");
    if (input.status === "archived") {
        if (await hasActiveOrders(createSchoolDomainRepository(), context.school.id, groupId)) throw new SchoolServiceError(409, "小组仍有关联中的商单");
        const updated = await compute.transact(async (repository) => {
            const locked = await repository.getGroup(context.school.id, groupId, true);
            if (!locked) throw new SchoolServiceError(404, "制作小组不存在");
            if (await hasPendingRequests(repository, context.school.id, groupId)) throw new SchoolServiceError(409, "小组仍有待审批的算力申请");
            if (await hasUnsettledAdvances(repository, context.school.id, groupId)) throw new SchoolServiceError(409, "小组仍有未结算的个人垫付");
            const now = new Date().toISOString();
            if (locked.schoolPointsBalance > 0)
                await repository.releaseGroupPoints(context.school.id, groupId, locked.schoolPointsBalance, {
                    id: randomUUID(),
                    schoolId: context.school.id,
                    groupId,
                    type: "group_archive_release",
                    amount: locked.schoolPointsBalance,
                    balanceAfter: 0,
                    idempotencyKey: `group-archive:${groupId}`,
                    createdAt: now,
                    actorUserId: managerId,
                });
            return repository.updateGroup(context.school.id, groupId, { status: "archived", schoolPointsBalance: 0, updatedAt: now });
        });
        if (!updated) throw new SchoolServiceError(409, "制作小组状态已变化，请刷新后重试");
        return toDetails(createSchoolDomainRepository(), updated);
    }
    const updated = await compute.updateGroup(context.school.id, groupId, {
        name: input.name === undefined ? undefined : text(input.name, 120),
        description: input.description === undefined ? undefined : text(input.description, 2000),
        status: input.status,
        updatedAt: new Date().toISOString(),
    });
    if (!updated) throw new SchoolServiceError(409, "制作小组状态已变化，请刷新后重试");
    return toDetails(createSchoolDomainRepository(), updated);
}

export async function getProductionGroup(userId: string, groupId: string): Promise<ProductionGroupDetails> {
    const context = await requireActiveSchoolContext(userId);
    const compute = createSchoolComputeRepository();
    const group = await compute.getGroup(context.school.id, groupId);
    if (!group) throw new SchoolServiceError(404, "制作小组不存在");
    const member = await compute.getGroupMember(context.school.id, groupId, context.membership.id);
    if (context.canManageSchool || member) return toDetails(createSchoolDomainRepository(), group);
    throw new SchoolServiceError(404, "制作小组不存在");
}

export async function listProductionGroupsForSchool(managerId: string, input: { page?: number; pageSize?: number; keyword?: string; status?: ProductionGroup["status"] } = {}) {
    const context = await requireSchoolManager(managerId);
    const page = await createSchoolComputeRepository().listGroups(context.school.id, input);
    return { ...page, items: await Promise.all(page.items.map((group) => toDetails(createSchoolDomainRepository(), group))) };
}

export async function listTeachingProductionGroups(userId: string, input: { page?: number; pageSize?: number } = {}) {
    const context = await requireActiveSchoolContext(userId);
    const compute = createSchoolComputeRepository();
    const page = await compute.listGroupsForMembership(context.school.id, context.membership.id, { ...input, status: undefined });
    return { ...page, items: await Promise.all(page.items.map((group) => toDetails(createSchoolDomainRepository(), group))) };
}

export async function listGroupAllocationRequests(userId: string, groupId: string, input: { page?: number; pageSize?: number } = {}) {
    const context = await requireActiveSchoolContext(userId);
    const compute = createSchoolComputeRepository();
    const group = await compute.getGroup(context.school.id, groupId);
    if (!group) throw new SchoolServiceError(404, "制作小组不存在");
    const member = await compute.getGroupMember(context.school.id, groupId, context.membership.id);
    const canRead = context.canManageSchool || Boolean(member);
    if (!canRead) throw new SchoolServiceError(404, "制作小组不存在");
    const page = await compute.listAllocationRequests(context.school.id, groupId, input);
    return { ...page, items: page.items.map(toAllocation) };
}

export async function replaceProductionGroupMembers(managerId: string, groupId: string, input: { leaderMembershipId: string; memberMembershipIds: string[] }): Promise<ProductionGroupDetails> {
    const context = await requireSchoolManager(managerId);
    const members = normalizeIds(input.memberMembershipIds);
    const leaderId = text(input.leaderMembershipId, 100);
    if (!leaderId || !members.includes(leaderId)) throw new SchoolServiceError(400, "组长必须属于制作小组成员");
    const school = createSchoolDomainRepository();
    await assertActiveMembers(school, context.school.id, members);
    const compute = createSchoolComputeRepository();
    const group = await compute.getGroup(context.school.id, groupId, true);
    if (!group) throw new SchoolServiceError(404, "制作小组不存在");
    const now = new Date().toISOString();
    const updated = await compute.transact(async (repository) => {
        await repository.replaceGroupMembers(context.school.id, groupId, memberRecords(context.school.id, groupId, members, leaderId, now));
        return repository.updateGroup(context.school.id, groupId, { leaderMembershipId: leaderId, updatedAt: now });
    });
    if (!updated) throw new SchoolServiceError(409, "制作小组成员已变化，请刷新后重试");
    return toDetails(school, updated);
}

export async function linkCommercialOrderToGroup(managerId: string, groupId: string, orderId: string): Promise<ProductionGroupDetails> {
    const context = await requireSchoolManager(managerId);
    const link = async (school: SchoolDomainRepository, compute: ReturnType<typeof createSchoolComputeRepository>) => {
        const group = await compute.getGroup(context.school.id, groupId, true);
        if (!group) throw new SchoolServiceError(404, "制作小组不存在");
        if (group.status === "archived" || group.status === "settled") throw new SchoolServiceError(409, "已结束的小组不能绑定商单");
        const order = await school.getCommercialOrder(context.school.id, orderId, true);
        if (!order) throw new SchoolServiceError(404, "商单不存在");
        if (["accepted", "cancelled"].includes(order.status)) throw new SchoolServiceError(409, "已验收或已取消商单不能绑定制作小组");
        if (order.productionGroupId && order.productionGroupId !== groupId) throw new SchoolServiceError(409, "同一商单只能绑定一个制作小组");
        const updated = await school.setCommercialOrderProductionGroup(context.school.id, orderId, groupId, new Date().toISOString());
        if (!updated) throw new SchoolServiceError(409, "商单绑定已变化，请刷新后重试");
        return group;
    };
    const group =
        getDatabaseProvider() === "postgres"
            ? await withPostgresTransaction((executor) => link(createSchoolDomainRepository(executor), createSchoolComputeRepository(executor)))
            : await withJsonDataFileLocks([SCHOOL_DOMAIN_DATA_FILE, SCHOOL_COMPUTE_DATA_FILE], async () => {
                  const [schoolBefore, computeBefore] = await Promise.all([readJsonDataFile<Record<string, unknown>>(SCHOOL_DOMAIN_DATA_FILE, {}), readJsonDataFile<Record<string, unknown>>(SCHOOL_COMPUTE_DATA_FILE, {})]);
                  try {
                      return await mutateFileSchoolDomainInsideLock((school) => mutateFileSchoolComputeInsideLock((compute) => link(school, compute)));
                  } catch (error) {
                      await Promise.all([writeJsonDataFile(SCHOOL_DOMAIN_DATA_FILE, schoolBefore), writeJsonDataFile(SCHOOL_COMPUTE_DATA_FILE, computeBefore)]);
                      throw error;
                  }
              });
    return toDetails(createSchoolDomainRepository(), group);
}

export async function linkProjectToProductionGroup(userId: string, groupId: string, input: { orderId: string; projectType: "canvas" | "drama"; projectId: string }): Promise<ProductionGroupProject> {
    const context = await requireActiveSchoolContext(userId);
    const orderId = text(input.orderId, 100);
    const projectId = text(input.projectId, 160);
    if (!orderId || !projectId || (input.projectType !== "canvas" && input.projectType !== "drama")) throw new SchoolServiceError(400, "项目关联参数无效");
    const compute = createSchoolComputeRepository();
    const group = await compute.getGroup(context.school.id, groupId);
    if (!group) throw new SchoolServiceError(404, "制作小组不存在");
    if (group.status !== "active") throw new SchoolServiceError(409, "当前制作小组不能关联项目");
    if (!(await compute.getGroupMember(context.school.id, groupId, context.membership.id))) throw new SchoolServiceError(403, "只有制作小组成员可以关联项目");
    await validateSchoolContentReferences({ userId, schoolId: context.school.id, references: [{ type: input.projectType, id: projectId }] });
    const order = await createSchoolDomainRepository().getCommercialOrder(context.school.id, orderId);
    if (!order || order.productionGroupId !== groupId) throw new SchoolServiceError(404, "商单不存在或未绑定当前小组");
    if (!["in_progress", "revision_required"].includes(order.status)) throw new SchoolServiceError(409, "只有进行中或返修中的商单可以关联项目");

    return compute.transact(async (repository) => {
        const existing = await repository.getGroupProjectByProject(input.projectType, projectId, true);
        if (existing) {
            if (existing.schoolId === context.school.id && existing.groupId === groupId && existing.orderId === orderId) return toProject(existing);
            throw new SchoolServiceError(409, "项目已有未结算的商单关联");
        }
        const now = new Date().toISOString();
        try {
            return toProject(
                await repository.insertGroupProject({
                    id: randomUUID(),
                    schoolId: context.school.id,
                    groupId,
                    orderId,
                    projectType: input.projectType,
                    projectId,
                    createdByMembershipId: context.membership.id,
                    createdAt: now,
                    updatedAt: now,
                }),
            );
        } catch (error) {
            const duplicate = await repository.getGroupProjectByProject(input.projectType, projectId, true);
            if (duplicate && duplicate.schoolId === context.school.id && duplicate.groupId === groupId && duplicate.orderId === orderId) return toProject(duplicate);
            if (duplicate) throw new SchoolServiceError(409, "项目已有未结算的商单关联");
            throw error;
        }
    });
}

export async function unlinkProjectFromProductionGroup(userId: string, groupId: string, linkId: string): Promise<{ removed: true }> {
    const context = await requireActiveSchoolContext(userId);
    const id = text(linkId, 100);
    if (!id) throw new SchoolServiceError(400, "缺少项目关联编号");
    const compute = createSchoolComputeRepository();
    return compute.transact(async (repository) => {
        const [group, link] = await Promise.all([repository.getGroup(context.school.id, groupId, true), repository.getGroupProject(context.school.id, groupId, id, true)]);
        if (!group || !link) throw new SchoolServiceError(404, "项目关联不存在");
        if (!context.canManageSchool && group.leaderMembershipId !== context.membership.id) throw new SchoolServiceError(403, "只有组长或学校管理员可以解除项目关联");
        if (!(await repository.deleteGroupProject(context.school.id, groupId, id))) throw new SchoolServiceError(409, "项目关联已变化，请刷新后重试");
        return { removed: true };
    });
}

export async function allocateSchoolPointsToGroup(managerId: string, groupId: string, input: { amount: number; reason: string; orderId?: string; idempotencyKey: string }): Promise<ProductionGroupDetails> {
    const context = await requireSchoolManager(managerId);
    const amount = positiveAmount(input.amount);
    const key = text(input.idempotencyKey, 200);
    if (!key) throw new SchoolServiceError(400, "缺少幂等编号");
    const school = createSchoolDomainRepository();
    const compute = createSchoolComputeRepository();
    const group = await compute.getGroup(context.school.id, groupId, true);
    if (!group) throw new SchoolServiceError(404, "制作小组不存在");
    if (!["draft", "active"].includes(group.status)) throw new SchoolServiceError(409, "当前小组不能分配学校算力");
    if (input.orderId) {
        const order = await school.getCommercialOrder(context.school.id, input.orderId, true);
        if (!order || order.productionGroupId !== groupId) throw new SchoolServiceError(404, "商单不存在或未绑定当前小组");
        if (["accepted", "cancelled"].includes(order.status)) throw new SchoolServiceError(409, "已结束商单不能追加学校算力");
    }
    const now = new Date().toISOString();
    await compute.allocateToGroup(context.school.id, groupId, amount, {
        id: randomUUID(),
        schoolId: context.school.id,
        groupId,
        ...(input.orderId ? { orderId: input.orderId } : {}),
        type: "group_allocation",
        amount: -amount,
        balanceAfter: 0,
        idempotencyKey: key,
        createdAt: now,
        actorUserId: managerId,
    });
    const updated = await compute.getGroup(context.school.id, groupId);
    if (!updated) throw new SchoolServiceError(404, "制作小组不存在");
    return toDetails(school, updated);
}

export async function requestGroupAllocation(userId: string, groupId: string, input: { orderId: string; amount: number; reason: string }): Promise<ComputeAllocationRequest> {
    const context = await requireActiveSchoolContext(userId);
    const amount = positiveAmount(input.amount);
    const compute = createSchoolComputeRepository();
    const group = await compute.getGroup(context.school.id, groupId);
    if (!group) throw new SchoolServiceError(404, "制作小组不存在");
    const members = await compute.listGroupMembers(context.school.id, groupId, { page: 1, pageSize: 100 });
    if (context.membership.id !== group.leaderMembershipId || !members.items.some((item) => item.membershipId === context.membership.id)) throw new SchoolServiceError(403, "只有制作小组组长可以申请追加算力");
    const order = await createSchoolDomainRepository().getCommercialOrder(context.school.id, input.orderId);
    if (!order || order.productionGroupId !== groupId) throw new SchoolServiceError(404, "商单不存在或未绑定当前小组");
    if (["accepted", "cancelled"].includes(order.status)) throw new SchoolServiceError(409, "已结束商单不能申请追加算力");
    const now = new Date().toISOString();
    const created = await compute.insertAllocationRequest({
        id: randomUUID(),
        schoolId: context.school.id,
        groupId,
        orderId: input.orderId,
        requestedByMembershipId: context.membership.id,
        amount,
        reason: text(input.reason, 2000),
        status: "pending",
        reviewNote: "",
        createdAt: now,
        updatedAt: now,
    });
    return toAllocation(created);
}

export async function reviewGroupAllocation(managerId: string, requestId: string, input: { decision: "approved" | "rejected"; note: string }): Promise<ComputeAllocationRequest> {
    const context = await requireSchoolManager(managerId);
    const compute = createSchoolComputeRepository();
    const current = await compute.getAllocationRequest(context.school.id, requestId, true);
    if (!current) throw new SchoolServiceError(404, "追加申请不存在");
    if (current.status !== "pending") return toAllocation(current);
    const updated = await compute.transact(async (repository) => {
        const locked = await repository.getAllocationRequest(context.school.id, requestId, true);
        if (!locked) throw new SchoolServiceError(404, "追加申请不存在");
        if (locked.status !== "pending") return locked;
        const now = new Date().toISOString();
        if (input.decision === "approved")
            await repository.allocateToGroup(context.school.id, locked.groupId, locked.amount, {
                id: randomUUID(),
                schoolId: context.school.id,
                groupId: locked.groupId,
                orderId: locked.orderId,
                type: "group_allocation_request",
                amount: -locked.amount,
                balanceAfter: 0,
                idempotencyKey: `allocation-request:${requestId}`,
                createdAt: now,
                actorUserId: managerId,
            });
        return repository.updateAllocationRequest(context.school.id, requestId, { status: input.decision, reviewNote: text(input.note, 2000), reviewedByMembershipId: context.membership.id, updatedAt: now });
    });
    if (!updated) throw new SchoolServiceError(409, "追加申请状态已变化，请刷新后重试");
    return toAllocation(updated);
}

async function toDetails(school: SchoolDomainRepository, group: ProductionGroupRecord): Promise<ProductionGroupDetails> {
    const compute = createSchoolComputeRepository();
    const [members, orders] = await Promise.all([compute.listGroupMembers(group.schoolId, group.id, { page: 1, pageSize: 100 }), school.listCommercialOrdersForProductionGroup(group.schoolId, group.id, { page: 1, pageSize: 100 })]);
    const memberships = (await Promise.all(members.items.map((item) => school.getMembership(group.schoolId, item.membershipId)))).filter((row): row is NonNullable<typeof row> => Boolean(row));
    const users = await getPublicUsersByIds(memberships.map((row) => row.userId));
    const userMap = new Map(users.map((user) => [user.id, user]));
    const membershipMap = new Map(memberships.map((membership) => [membership.id, membership]));
    const memberDetails: ProductionGroupMember[] = [];
    for (const member of members.items) {
        const membership = membershipMap.get(member.membershipId);
        const user = membership ? userMap.get(membership.userId) : undefined;
        memberDetails.push({ id: member.id, membershipId: member.membershipId, role: member.role, displayName: user?.displayName || "成员信息不可用", accountId: user?.accountId || "" });
    }
    return { ...toGroup(group), members: memberDetails, orders: orders.items.map((order) => ({ id: order.id, title: order.title, status: order.status })) };
}

function toGroup(record: ProductionGroupRecord): ProductionGroup {
    return {
        id: record.id,
        schoolId: record.schoolId,
        name: record.name,
        description: record.description,
        leaderMembershipId: record.leaderMembershipId,
        status: record.status,
        schoolPointsBalance: record.schoolPointsBalance,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}
function toAllocation(record: ComputeAllocationRequestRecord): ComputeAllocationRequest {
    return { id: record.id, groupId: record.groupId, orderId: record.orderId, amount: record.amount, reason: record.reason, status: record.status, reviewNote: record.reviewNote, createdAt: record.createdAt, updatedAt: record.updatedAt };
}
function toProject(record: import("./school-compute-repository").ProductionGroupProjectRecord): ProductionGroupProject {
    return { id: record.id, groupId: record.groupId, orderId: record.orderId, projectType: record.projectType, projectId: record.projectId, createdAt: record.createdAt };
}
function memberRecords(schoolId: string, groupId: string, ids: string[], leaderId: string, now: string): ProductionGroupMemberRecord[] {
    return ids.map((membershipId) => ({ id: randomUUID(), schoolId, groupId, membershipId, role: membershipId === leaderId ? "leader" : "member", createdAt: now, updatedAt: now }));
}
async function assertActiveMembers(repository: SchoolDomainRepository, schoolId: string, ids: string[]) {
    for (const id of ids) {
        const member = await repository.getMembership(schoolId, id, true);
        if (!member || member.status !== "active") throw new SchoolServiceError(404, "制作小组只能添加本校有效成员");
    }
}
function normalizeIds(values: string[]) {
    return [...new Set((values || []).map((value) => text(value, 100)).filter(Boolean))];
}
function text(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function positiveAmount(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new SchoolServiceError(400, "算力金额必须大于零");
    return value;
}

async function hasActiveOrders(repository: SchoolDomainRepository, schoolId: string, groupId: string) {
    for (let page = 1; ; page += 1) {
        const result = await repository.listCommercialOrdersForProductionGroup(schoolId, groupId, { page, pageSize: 100 });
        if (result.items.some((order) => ["assigned", "in_progress", "submitted", "revision_required"].includes(order.status))) return true;
        if (page * result.pageSize >= result.total) return false;
    }
}

async function hasPendingRequests(repository: ReturnType<typeof createSchoolComputeRepository>, schoolId: string, groupId: string) {
    for (let page = 1; ; page += 1) {
        const result = await repository.listAllocationRequests(schoolId, groupId, { page, pageSize: 100 });
        if (result.items.some((request) => request.status === "pending")) return true;
        if (page * result.pageSize >= result.total) return false;
    }
}

async function hasUnsettledAdvances(repository: ReturnType<typeof createSchoolComputeRepository>, schoolId: string, groupId: string) {
    for (let page = 1; ; page += 1) {
        const result = await repository.listPersonalAdvances(schoolId, groupId, { page, pageSize: 100 });
        if (result.items.some((advance) => advance.status !== "returned")) return true;
        if (page * result.pageSize >= result.total) return false;
    }
}
