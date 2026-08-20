import { randomUUID } from "node:crypto";

import { AUTH_DATA_FILE } from "@/lib/auth/store-foundation";
import { emptyDb, normalizeDb } from "@/lib/auth/store-normalizers";
import { writeAuthDb } from "@/lib/auth/store-repository";
import type { AuthDatabase } from "@/lib/auth/store-types";
import type { PersonalComputeAdvance } from "@/lib/school-compute-domain";
import { readJsonDataFile, withJsonDataFileLocks, writeJsonDataFile } from "./data-adapter";
import { getDatabaseProvider, withPostgresTransaction } from "./database/postgres";
import { mutatePermanentPointsInAuthDb, mutatePermanentPointsInPostgresTransaction, type PermanentPointBusinessMutationInput } from "./points-wallet-service";
import { requireActiveSchoolContext, SchoolServiceError } from "./school-access-service";
import { mutateFileSchoolComputeInsideLock, SCHOOL_COMPUTE_DATA_FILE } from "./school-compute-file-repository";
import { createSchoolComputeRepository, type PersonalAdvanceRecord, type SchoolComputeRepository } from "./school-compute-repository";
import { mutateFileSchoolDomainInsideLock, SCHOOL_DOMAIN_DATA_FILE } from "./school-domain-file-repository";
import { createSchoolDomainRepository, type Page, type PageQuery, type SchoolDomainRepository } from "./school-domain-repository";

type CreateAdvanceInput = { orderId: string; amount: number; idempotencyKey: string };
type NormalizedCreateAdvanceInput = { orderId: string; amount: number; idempotencyKey: string };
type WalletMutation = (input: PermanentPointBusinessMutationInput) => Promise<{ applied: boolean; record: { id: string } }>;

export async function createPersonalAdvance(userId: string, groupId: string, input: CreateAdvanceInput): Promise<PersonalComputeAdvance> {
    const context = await requireActiveSchoolContext(userId);
    const normalizedInput: NormalizedCreateAdvanceInput = {
        orderId: requiredText(input.orderId, 100, "缺少商单编号"),
        amount: positiveAmount(input.amount),
        idempotencyKey: requiredText(input.idempotencyKey, 160, "缺少幂等编号"),
    };
    const record =
        getDatabaseProvider() === "postgres"
            ? await withPostgresTransaction((executor) =>
                  createInsideTransaction(userId, context.school.id, context.membership.id, groupId, normalizedInput, createSchoolDomainRepository(executor), createSchoolComputeRepository(executor), (walletInput) =>
                      mutatePermanentPointsInPostgresTransaction(executor, walletInput),
                  ),
              )
            : await createFileAdvance(userId, context.school.id, context.membership.id, groupId, normalizedInput);
    return toAdvance(record);
}

export async function listOwnPersonalAdvances(userId: string, groupId: string, input: PageQuery = {}): Promise<Page<PersonalComputeAdvance>> {
    const context = await requireActiveSchoolContext(userId);
    const compute = createSchoolComputeRepository();
    const group = await compute.getGroup(context.school.id, groupId);
    if (!group || !(await compute.getGroupMember(context.school.id, groupId, context.membership.id))) throw new SchoolServiceError(404, "制作小组不存在");
    const page = await compute.listPersonalAdvances(context.school.id, groupId, { ...input, membershipId: context.membership.id });
    return { ...page, items: page.items.map(toAdvance) };
}

async function createFileAdvance(userId: string, schoolId: string, membershipId: string, groupId: string, input: NormalizedCreateAdvanceInput) {
    return withJsonDataFileLocks([AUTH_DATA_FILE, SCHOOL_DOMAIN_DATA_FILE, SCHOOL_COMPUTE_DATA_FILE], async () => {
        const [authBefore, schoolBefore, computeBefore] = await Promise.all([
            readJsonDataFile<Partial<AuthDatabase>>(AUTH_DATA_FILE, emptyDb()),
            readJsonDataFile<Record<string, unknown>>(SCHOOL_DOMAIN_DATA_FILE, {}),
            readJsonDataFile<Record<string, unknown>>(SCHOOL_COMPUTE_DATA_FILE, {}),
        ]);
        const authDb = normalizeDb(authBefore);
        try {
            return await mutateFileSchoolDomainInsideLock((school) =>
                mutateFileSchoolComputeInsideLock(async (compute) => {
                    const record = await createInsideTransaction(userId, schoolId, membershipId, groupId, input, school, compute, async (walletInput) => mutatePermanentPointsInAuthDb(authDb, walletInput));
                    await writeAuthDb(authDb);
                    return record;
                }),
            );
        } catch (error) {
            await Promise.all([writeJsonDataFile(AUTH_DATA_FILE, authBefore), writeJsonDataFile(SCHOOL_DOMAIN_DATA_FILE, schoolBefore), writeJsonDataFile(SCHOOL_COMPUTE_DATA_FILE, computeBefore)]);
            throw error;
        }
    });
}

async function createInsideTransaction(userId: string, schoolId: string, membershipId: string, groupId: string, input: NormalizedCreateAdvanceInput, school: SchoolDomainRepository, compute: SchoolComputeRepository, mutateWallet: WalletMutation) {
    const membership = await school.getMembership(schoolId, membershipId, true);
    if (!membership || membership.userId !== userId || membership.status !== "active") throw new SchoolServiceError(404, "学校成员身份不存在");
    const group = await compute.getGroup(schoolId, groupId, true);
    if (!group) throw new SchoolServiceError(404, "制作小组不存在");
    if (!["draft", "active"].includes(group.status)) throw new SchoolServiceError(409, "当前制作小组不能新增个人垫付");
    if (!(await compute.getGroupMember(schoolId, groupId, membershipId, true))) throw new SchoolServiceError(403, "当前账号不是制作小组成员");
    const order = await school.getCommercialOrder(schoolId, input.orderId, true);
    if (!order || order.assignedSchoolId !== schoolId || order.productionGroupId !== groupId) throw new SchoolServiceError(404, "商单不存在或未绑定当前小组");
    if (["accepted", "cancelled"].includes(order.status)) throw new SchoolServiceError(409, "已结束商单不能新增个人垫付");
    const wallet = await mutateWallet({ userId, amount: -input.amount, description: "学校算力个人垫付", idempotencyKey: `school-compute-advance:${input.idempotencyKey}`, recordType: "consume", model: "school-compute" });
    if (!wallet.applied) {
        const existing = await compute.getPersonalAdvanceByPointRecordId(wallet.record.id, true);
        if (!existing) throw new SchoolServiceError(409, "个人垫付幂等记录不完整");
        assertSameAdvance(existing, { userId, schoolId, membershipId, groupId, orderId: input.orderId, amount: input.amount });
        return existing;
    }
    const now = new Date().toISOString();
    return compute.insertPersonalAdvance({
        id: randomUUID(),
        schoolId,
        groupId,
        orderId: input.orderId,
        membershipId,
        userId,
        originalPoints: input.amount,
        consumedPoints: 0,
        remainingPoints: input.amount,
        returnedPoints: 0,
        status: "active",
        pointRecordId: wallet.record.id,
        createdAt: now,
        updatedAt: now,
    });
}

function assertSameAdvance(record: PersonalAdvanceRecord, expected: { userId: string; schoolId: string; membershipId: string; groupId: string; orderId: string; amount: number }) {
    if (
        record.userId !== expected.userId ||
        record.schoolId !== expected.schoolId ||
        record.membershipId !== expected.membershipId ||
        record.groupId !== expected.groupId ||
        record.orderId !== expected.orderId ||
        record.originalPoints !== expected.amount
    ) {
        throw new SchoolServiceError(409, "个人垫付幂等编号已被其他业务使用");
    }
}

function toAdvance(record: PersonalAdvanceRecord): PersonalComputeAdvance {
    return {
        id: record.id,
        groupId: record.groupId,
        orderId: record.orderId,
        membershipId: record.membershipId,
        originalPoints: record.originalPoints,
        consumedPoints: record.consumedPoints,
        remainingPoints: record.remainingPoints,
        returnedPoints: record.returnedPoints,
        status: record.status,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
    };
}

function positiveAmount(value: unknown) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) throw new SchoolServiceError(400, "垫付积分必须大于零");
    const amount = Number(value.toFixed(2));
    if (amount <= 0) throw new SchoolServiceError(400, "垫付积分必须大于零");
    return amount;
}

function requiredText(value: unknown, maxLength: number, message: string) {
    const text = typeof value === "string" ? value.trim().slice(0, maxLength) : "";
    if (!text) throw new SchoolServiceError(400, message);
    return text;
}
