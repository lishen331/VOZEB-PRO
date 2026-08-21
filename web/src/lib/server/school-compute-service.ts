import { randomUUID } from "node:crypto";

import { getPublicUsersByIds, type PublicUser } from "@/lib/auth/store";
import { hasAdminPermission } from "@/lib/admin-permissions";
import type { PageResult } from "@/lib/school-domain";
import type { AdminSchoolComputePool, AdminSchoolComputePoolDetails, SchoolComputeLedgerEntry, SchoolComputePoolSummary, SchoolComputePoolStatus } from "@/lib/school-compute-domain";
import { requireActiveSchoolContext } from "@/lib/server/school-access-service";
import { createSchoolDomainRepository, type SchoolRecord } from "@/lib/server/school-domain-repository";
import { createSchoolComputeRepository, type ComputeLedgerPageQuery, type ComputePoolPageQuery, type SchoolComputeLedgerRecord, type SchoolComputePoolMetricsRecord } from "@/lib/server/school-compute-repository";

export class SchoolComputeServiceError extends Error {
    constructor(
        public readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

type PoolMutationInput = { amount: number; reason: string; idempotencyKey: string };

export async function listAdminSchoolComputePools(actorId: string, input: ComputePoolPageQuery = {}): Promise<PageResult<AdminSchoolComputePool>> {
    await requireAdminRead(actorId);
    const schoolRepository = createSchoolDomainRepository();
    const computeRepository = createSchoolComputeRepository();
    if (input.status) {
        const result = await computeRepository.listPoolMetricsPage({ ...input, pageSize: Math.min(100, positiveInteger(input.pageSize, 20)) });
        const schools = await schoolRepository.listSchoolsByIds(result.items.map((item) => item.schoolId));
        const schoolsById = new Map(schools.map((school) => [school.id, school]));
        return { ...result, items: result.items.flatMap((metrics) => (schoolsById.has(metrics.schoolId) ? [{ ...metrics, schoolName: schoolsById.get(metrics.schoolId)?.name || metrics.schoolId }] : [])) };
    }
    const schools = await schoolRepository.listSchools({ page: input.page, pageSize: input.pageSize, keyword: input.keyword });
    const metrics = await computeRepository.listPoolMetricsBySchoolIds(schools.items.map((school) => school.id));
    const metricsBySchoolId = new Map(metrics.map((item) => [item.schoolId, item]));
    return { ...schools, items: schools.items.map((school) => toAdminPool(school, metricsBySchoolId.get(school.id))) };
}

export async function getAdminSchoolComputePool(actorId: string, schoolId: string): Promise<AdminSchoolComputePoolDetails> {
    await requireAdminRead(actorId);
    const school = await requireSchool(schoolId);
    const repository = createSchoolComputeRepository();
    const metrics = await repository.getPoolMetrics(schoolId);
    const ledger = await repository.listLedger(schoolId, { page: 1, pageSize: 20 });
    return toDetails(school, metrics, ledger);
}

export async function listAdminSchoolComputeLedger(actorId: string, schoolId: string, input: ComputeLedgerPageQuery = {}): Promise<PageResult<SchoolComputeLedgerEntry>> {
    await requireAdminRead(actorId);
    await requireSchool(schoolId);
    const result = await createSchoolComputeRepository().listLedger(schoolId, input);
    return toLedgerPage(result);
}

export async function creditSchoolComputePool(actorId: string, schoolId: string, input: PoolMutationInput): Promise<AdminSchoolComputePoolDetails> {
    await requireAdminManage(actorId);
    const school = await requireActiveSchool(schoolId);
    const normalized = normalizeMutation(input, true);
    const repository = createSchoolComputeRepository();
    const duplicate = await repository.getLedgerEntryByIdempotencyKey(normalized.idempotencyKey);
    assertDuplicateMatches(duplicate, schoolId, "credit");
    if (!duplicate) {
        await repository.transact(async (transaction) => {
            const now = new Date().toISOString();
            const pool = await transaction.getPool(schoolId, true);
            if (!pool) await transaction.upsertPool({ schoolId, availablePoints: 0, status: "active", createdAt: now, updatedAt: now });
            else if (pool.status !== "active") throw new SchoolComputeServiceError(409, "学校算力池已冻结，不能充值");
            const entry = ledgerEntry(schoolId, normalized, actorId, "credit");
            await transaction.creditPool(schoolId, normalized.amount, entry);
        });
    }
    return getAdminSchoolComputePool(actorId, school.id);
}

export async function adjustSchoolComputePool(actorId: string, schoolId: string, input: PoolMutationInput): Promise<AdminSchoolComputePoolDetails> {
    await requireAdminManage(actorId);
    const school = await requireActiveSchool(schoolId);
    const normalized = normalizeMutation(input, false);
    const repository = createSchoolComputeRepository();
    const duplicate = await repository.getLedgerEntryByIdempotencyKey(normalized.idempotencyKey);
    assertDuplicateMatches(duplicate, schoolId, "adjust");
    if (!duplicate) {
        await repository.transact(async (transaction) => {
            const now = new Date().toISOString();
            const pool = await transaction.getPool(schoolId, true);
            if (!pool) await transaction.upsertPool({ schoolId, availablePoints: 0, status: "active", createdAt: now, updatedAt: now });
            else if (pool.status !== "active") throw new SchoolComputeServiceError(409, "学校算力池已冻结，不能调账");
            if ((pool?.availablePoints || 0) + normalized.amount < 0) throw new SchoolComputeServiceError(409, "学校算力池余额不足");
            await transaction.adjustPool(schoolId, normalized.amount, ledgerEntry(schoolId, normalized, actorId, "adjust"));
        });
    }
    return getAdminSchoolComputePool(actorId, school.id);
}

export async function setSchoolComputePoolStatus(actorId: string, schoolId: string, status: Extract<SchoolComputePoolStatus, "active" | "frozen">): Promise<AdminSchoolComputePoolDetails> {
    await requireAdminManage(actorId);
    const school = await requireActiveSchool(schoolId);
    if (status !== "active" && status !== "frozen") throw new SchoolComputeServiceError(400, "算力池状态无效");
    const repository = createSchoolComputeRepository();
    await repository.transact(async (transaction) => {
        const now = new Date().toISOString();
        const pool = await transaction.getPool(schoolId, true);
        await transaction.upsertPool({ schoolId, availablePoints: pool?.availablePoints || 0, status, createdAt: pool?.createdAt || now, updatedAt: now });
    });
    return getAdminSchoolComputePool(actorId, school.id);
}

export async function getCurrentSchoolComputePool(userId: string): Promise<SchoolComputePoolSummary> {
    const context = await requireActiveSchoolContext(userId);
    return toPoolSummary((await createSchoolComputeRepository().getPoolMetrics(context.school.id)) || emptyMetrics(context.school.id, new Date().toISOString()));
}

export async function listCurrentSchoolComputeLedger(userId: string, input: ComputeLedgerPageQuery = {}): Promise<PageResult<SchoolComputeLedgerEntry>> {
    const context = await requireActiveSchoolContext(userId);
    const result = await createSchoolComputeRepository().listLedger(context.school.id, input);
    return toLedgerPage(result);
}

async function requireAdminRead(actorId: string): Promise<PublicUser> {
    const actor = (await getPublicUsersByIds([actorId]))[0];
    if (!actor || (!hasAdminPermission(actor, "education.manage") && !hasAdminPermission(actor, "billing.manage"))) throw new SchoolComputeServiceError(403, "当前管理员没有查看学校算力池的职责权限");
    return actor;
}

async function requireAdminManage(actorId: string): Promise<PublicUser> {
    const actor = await requireAdminRead(actorId);
    if (!hasAdminPermission(actor, "education.manage") || !hasAdminPermission(actor, "billing.manage")) throw new SchoolComputeServiceError(403, "学校算力池操作需要产教运营和财务管理职责权限");
    return actor;
}

async function requireSchool(schoolId: string): Promise<SchoolRecord> {
    const school = await createSchoolDomainRepository().getSchool(schoolId);
    if (!school) throw new SchoolComputeServiceError(404, "学校不存在");
    return school;
}

async function requireActiveSchool(schoolId: string): Promise<SchoolRecord> {
    const school = await requireSchool(schoolId);
    if (school.status !== "active") throw new SchoolComputeServiceError(409, "学校已停用，不能操作算力池");
    return school;
}

function normalizeMutation(input: PoolMutationInput, positive: boolean): PoolMutationInput {
    const rawAmount = Number(input?.amount);
    const amount = Math.round(rawAmount * 100) / 100;
    if (!Number.isFinite(amount) || (positive ? amount <= 0 : amount === 0)) throw new SchoolComputeServiceError(400, positive ? "充值金额必须大于 0" : "调账金额不能为 0");
    const reason = typeof input?.reason === "string" ? input.reason.trim() : "";
    const idempotencyKey = typeof input?.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    if (!reason || reason.length > 200) throw new SchoolComputeServiceError(400, "请填写有效的算力池操作原因");
    if (!idempotencyKey || idempotencyKey.length > 160) throw new SchoolComputeServiceError(400, "请填写有效的业务幂等编号");
    return { amount, reason, idempotencyKey };
}

function assertDuplicateMatches(entry: SchoolComputeLedgerRecord | null, schoolId: string, type: "credit" | "adjust") {
    if (entry && (entry.schoolId !== schoolId || entry.type !== type)) throw new SchoolComputeServiceError(409, "业务幂等编号已用于其他算力池操作");
}

function ledgerEntry(schoolId: string, input: PoolMutationInput, actorUserId: string, type: string): SchoolComputeLedgerRecord {
    return { id: randomUUID(), schoolId, type, amount: input.amount, balanceAfter: 0, idempotencyKey: input.idempotencyKey, actorUserId, createdAt: new Date().toISOString() };
}

function toAdminPool(school: SchoolRecord, metrics?: SchoolComputePoolMetricsRecord): AdminSchoolComputePool {
    const current = metrics || emptyMetrics(school.id, school.updatedAt);
    return { ...current, schoolName: school.name };
}

function toPoolSummary({ schoolId, totalPoints, availablePoints, allocatedPoints, consumedPoints, status }: SchoolComputePoolMetricsRecord): SchoolComputePoolSummary {
    return { schoolId, totalPoints, availablePoints, allocatedPoints, consumedPoints, status };
}

function toDetails(school: SchoolRecord, metrics: SchoolComputePoolMetricsRecord | null, ledger: { items: SchoolComputeLedgerRecord[]; total: number; page: number; pageSize: number }): AdminSchoolComputePoolDetails {
    const current = metrics || emptyMetrics(school.id, school.updatedAt);
    return { ...current, schoolName: school.name, ledger: toLedgerPage(ledger) };
}

function toLedgerPage(result: { items: SchoolComputeLedgerRecord[]; total: number; page: number; pageSize: number }): PageResult<SchoolComputeLedgerEntry> {
    return { ...result, items: result.items.map(({ id, schoolId, groupId, orderId, type, amount, balanceAfter, idempotencyKey, createdAt }) => ({ id, schoolId, groupId, orderId, type, amount, balanceAfter, idempotencyKey, createdAt })) };
}

function positiveInteger(value: number | undefined, fallback: number) {
    return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : fallback;
}

function emptyMetrics(schoolId: string, updatedAt: string): SchoolComputePoolMetricsRecord {
    return { schoolId, totalPoints: 0, availablePoints: 0, allocatedPoints: 0, consumedPoints: 0, status: "active", updatedAt };
}
