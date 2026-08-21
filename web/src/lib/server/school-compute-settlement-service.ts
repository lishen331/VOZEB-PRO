import { randomUUID } from "node:crypto";

import { getPublicUsersByIds } from "@/lib/auth/store";
import { AUTH_DATA_FILE } from "@/lib/auth/store-foundation";
import { emptyDb, normalizeDb } from "@/lib/auth/store-normalizers";
import { writeAuthDb } from "@/lib/auth/store-repository";
import type { AuthDatabase } from "@/lib/auth/store-types";
import type { ComputeSettlement, ComputeSettlementAdvance } from "@/lib/school-compute-domain";
import { readJsonDataFile, withJsonDataFileLocks, writeJsonDataFile } from "./data-adapter";
import { getDatabaseProvider, withPostgresTransaction, type QueryExecutor } from "./database/postgres";
import { mutatePermanentPointsInAuthDb, mutatePermanentPointsInPostgresTransaction, type PermanentPointBusinessMutationInput } from "./points-wallet-service";
import { requireSchoolManager, SchoolServiceError } from "./school-access-service";
import { mutateFileSchoolComputeInsideLock, SCHOOL_COMPUTE_DATA_FILE } from "./school-compute-file-repository";
import { createSchoolComputeRepository, type ComputeSettlementRecord, type PersonalAdvanceRecord, type SchoolComputeRepository } from "./school-compute-repository";
import { mutateFileSchoolDomainInsideLock, SCHOOL_DOMAIN_DATA_FILE } from "./school-domain-file-repository";
import { createSchoolDomainRepository, type Page, type PageQuery, type SchoolDomainRepository } from "./school-domain-repository";

type WalletMutation = (input: PermanentPointBusinessMutationInput) => Promise<{ applied: boolean; record: { id: string } }>;
type SettlementBundle = { record: ComputeSettlementRecord; advances: PersonalAdvanceRecord[] };

export async function openCommercialOrderSettlement(orderId: string, executor?: QueryExecutor): Promise<ComputeSettlement> {
    const bundle = executor ? await openWithPostgresExecutor(orderId, executor) : getDatabaseProvider() === "postgres" ? await withPostgresTransaction((transaction) => openWithPostgresExecutor(orderId, transaction)) : await openWithFileProvider(orderId);
    return toSettlement(bundle);
}

export async function openCommercialOrderSettlementInsideTransaction(orderId: string, school: SchoolDomainRepository, compute: SchoolComputeRepository, authDb: AuthDatabase): Promise<SettlementBundle> {
    return openWithWallet(orderId, school, compute, async (input) => mutatePermanentPointsInAuthDb(authDb, input));
}

export async function listGroupSettlements(managerId: string, groupId: string, input: PageQuery = {}): Promise<Page<ComputeSettlement>> {
    const context = await requireSchoolManager(managerId);
    const compute = createSchoolComputeRepository();
    const group = await compute.getGroup(context.school.id, groupId);
    if (!group) throw new SchoolServiceError(404, "制作小组不存在");
    const page = await compute.listSettlements(context.school.id, groupId, input);
    const advances = await compute.listPersonalAdvancesForOrders(
        context.school.id,
        page.items.map((item) => item.orderId),
    );
    return { ...page, items: await mapSettlementPage(page.items, advances) };
}

export async function confirmConsumedAdvanceReturns(managerId: string, groupId: string, settlementId: string, input: { advanceIds?: string[] } = {}): Promise<ComputeSettlement> {
    const context = await requireSchoolManager(managerId);
    const bundle =
        getDatabaseProvider() === "postgres"
            ? await withPostgresTransaction((executor) =>
                  confirmWithRepositories(context.school.id, groupId, settlementId, input, createSchoolDomainRepository(executor), createSchoolComputeRepository(executor), async (walletInput) =>
                      mutatePermanentPointsInPostgresTransaction(executor, walletInput),
                  ),
              )
            : await confirmWithFileProvider(context.school.id, groupId, settlementId, input);
    return toSettlement(bundle);
}

async function openWithPostgresExecutor(orderId: string, executor: QueryExecutor) {
    return openWithWallet(orderId, createSchoolDomainRepository(executor), createSchoolComputeRepository(executor), async (input) => mutatePermanentPointsInPostgresTransaction(executor, input));
}

async function openWithFileProvider(orderId: string) {
    return withJsonDataFileLocks([AUTH_DATA_FILE, SCHOOL_DOMAIN_DATA_FILE, SCHOOL_COMPUTE_DATA_FILE], async () => {
        const [authBefore, schoolBefore, computeBefore] = await Promise.all([
            readJsonDataFile<Partial<AuthDatabase>>(AUTH_DATA_FILE, emptyDb()),
            readJsonDataFile<Record<string, unknown>>(SCHOOL_DOMAIN_DATA_FILE, {}),
            readJsonDataFile<Record<string, unknown>>(SCHOOL_COMPUTE_DATA_FILE, {}),
        ]);
        const authDb = normalizeDb(authBefore);
        try {
            return await mutateFileSchoolDomainInsideLock((school) =>
                mutateFileSchoolComputeInsideLock((compute) =>
                    openCommercialOrderSettlementInsideTransaction(orderId, school, compute, authDb).then(async (bundle) => {
                        await writeAuthDb(authDb);
                        return bundle;
                    }),
                ),
            );
        } catch (error) {
            await restoreSnapshots(authBefore, schoolBefore, computeBefore);
            throw error;
        }
    });
}

async function confirmWithFileProvider(schoolId: string, groupId: string, settlementId: string, input: { advanceIds?: string[] }) {
    return withJsonDataFileLocks([AUTH_DATA_FILE, SCHOOL_DOMAIN_DATA_FILE, SCHOOL_COMPUTE_DATA_FILE], async () => {
        const [authBefore, schoolBefore, computeBefore] = await Promise.all([
            readJsonDataFile<Partial<AuthDatabase>>(AUTH_DATA_FILE, emptyDb()),
            readJsonDataFile<Record<string, unknown>>(SCHOOL_DOMAIN_DATA_FILE, {}),
            readJsonDataFile<Record<string, unknown>>(SCHOOL_COMPUTE_DATA_FILE, {}),
        ]);
        const authDb = normalizeDb(authBefore);
        try {
            return await mutateFileSchoolDomainInsideLock((school) =>
                mutateFileSchoolComputeInsideLock((compute) =>
                    confirmWithRepositories(schoolId, groupId, settlementId, input, school, compute, async (walletInput) => mutatePermanentPointsInAuthDb(authDb, walletInput)).then(async (bundle) => {
                        await writeAuthDb(authDb);
                        return bundle;
                    }),
                ),
            );
        } catch (error) {
            await restoreSnapshots(authBefore, schoolBefore, computeBefore);
            throw error;
        }
    });
}

async function openWithWallet(orderId: string, school: SchoolDomainRepository, compute: SchoolComputeRepository, mutateWallet: WalletMutation): Promise<SettlementBundle> {
    await compute.lockOperation(`school-compute:settlement:${orderId}`);
    const order = await school.getPlatformCommercialOrder(orderId, true);
    if (!order) throw new SchoolServiceError(404, "商单不存在");
    if (order.status !== "accepted") throw new SchoolServiceError(409, "只有已验收商单可以开启结算");
    if (!order.assignedSchoolId || !order.productionGroupId) throw new SchoolServiceError(409, "商单未绑定学校制作小组");
    const group = await compute.getGroup(order.assignedSchoolId, order.productionGroupId, true);
    if (!group) throw new SchoolServiceError(404, "制作小组不存在");
    const existing = await compute.getSettlement(order.assignedSchoolId, orderId, true);
    const advances = await compute.listPersonalAdvancesForOrders(order.assignedSchoolId, [orderId], true);
    if (existing) return { record: existing, advances };
    const consumptions = await compute.listConsumptionsForOrderRecords(order.assignedSchoolId, orderId, true);
    const settlementId = randomUUID();
    let unusedReturned = 0;
    let consumedPending = 0;
    const updatedAdvances: PersonalAdvanceRecord[] = [];
    for (const advance of walletMutationOrder(advances)) {
        const unused = Math.max(0, Math.min(advance.remainingPoints, advance.originalPoints - advance.consumedPoints));
        if (unused > 0) {
            await mutateWallet({ userId: advance.userId, amount: unused, description: "商单验收退回未使用学校算力垫付", idempotencyKey: `school-compute:settlement:${settlementId}:unused:${advance.id}`, recordType: "credit", model: "school-compute" });
        }
        const nextRemaining = Math.max(0, advance.remainingPoints - unused);
        const nextReturned = advance.returnedPoints + unused;
        const nextStatus = advance.consumedPoints > 0 ? "pending_school_confirmation" : "returned";
        const updated = unused > 0 || advance.status !== nextStatus ? await compute.updatePersonalAdvance(advance.id, { remainingPoints: nextRemaining, returnedPoints: nextReturned, status: nextStatus, updatedAt: new Date().toISOString() }) : advance;
        if (!updated) throw new SchoolServiceError(409, "个人垫付状态已变化，请刷新后重试");
        updatedAdvances.push(updated);
        unusedReturned += unused;
        consumedPending += Math.max(0, updated.consumedPoints - consumedReturnedFromAdvance(updated));
    }
    for (const consumption of consumptions) {
        if (consumption.status === "charged") await compute.updateConsumption(consumption.id, "settled", new Date().toISOString());
    }
    const now = new Date().toISOString();
    const record = await compute.insertSettlement({
        id: settlementId,
        schoolId: order.assignedSchoolId,
        groupId: order.productionGroupId,
        orderId,
        status: consumedPending > 0 ? "pending_school_confirmation" : "completed",
        unusedPersonalPointsReturned: unusedReturned,
        consumedPersonalPointsPending: consumedPending,
        confirmedPersonalPointsReturned: 0,
        createdAt: now,
        updatedAt: now,
    });
    return { record, advances: updatedAdvances };
}

async function confirmWithRepositories(schoolId: string, groupId: string, settlementId: string, input: { advanceIds?: string[] }, _school: SchoolDomainRepository, compute: SchoolComputeRepository, mutateWallet: WalletMutation): Promise<SettlementBundle> {
    await compute.lockOperation(`school-compute:settlement-confirm:${settlementId}`);
    const settlement = await compute.getSettlementById(schoolId, settlementId, true);
    if (!settlement || settlement.groupId !== groupId) throw new SchoolServiceError(404, "结算记录不存在");
    const group = await compute.getGroup(schoolId, settlement.groupId, true);
    if (!group) throw new SchoolServiceError(404, "制作小组不存在");
    const advances = await compute.listPersonalAdvancesForOrders(schoolId, [settlement.orderId], true);
    const selected = input.advanceIds === undefined ? advances : advances.filter((advance) => input.advanceIds!.includes(advance.id));
    if (input.advanceIds?.some((id) => !advances.some((advance) => advance.id === id))) throw new SchoolServiceError(404, "个人垫付记录不存在");
    const updatedAdvances: PersonalAdvanceRecord[] = [];
    for (const advance of walletMutationOrder(advances)) {
        if (!selected.some((item) => item.id === advance.id)) {
            updatedAdvances.push(advance);
            continue;
        }
        const due = Math.max(0, advance.consumedPoints - consumedReturnedFromAdvance(advance));
        if (due <= 0) {
            updatedAdvances.push(advance);
            continue;
        }
        await mutateWallet({ userId: advance.userId, amount: due, description: "学校确认退回已使用算力垫付", idempotencyKey: `school-compute:settlement:${settlementId}:consumed:${advance.id}`, recordType: "credit", model: "school-compute" });
        const updated = await compute.updatePersonalAdvance(advance.id, { returnedPoints: advance.returnedPoints + due, status: "returned", updatedAt: new Date().toISOString() });
        if (!updated) throw new SchoolServiceError(409, "个人垫付状态已变化，请刷新后重试");
        updatedAdvances.push(updated);
    }
    const pending = updatedAdvances.reduce((sum, advance) => sum + Math.max(0, advance.consumedPoints - consumedReturnedFromAdvance(advance)), 0);
    const confirmed = updatedAdvances.reduce((sum, advance) => sum + consumedReturnedFromAdvance(advance), 0);
    const updatedSettlement = await compute.updateSettlement(schoolId, settlement.orderId, {
        status: pending > 0 ? "pending_school_confirmation" : "completed",
        consumedPersonalPointsPending: pending,
        confirmedPersonalPointsReturned: confirmed,
        updatedAt: new Date().toISOString(),
    });
    if (!updatedSettlement) throw new SchoolServiceError(409, "结算状态已变化，请刷新后重试");
    return { record: updatedSettlement, advances: updatedAdvances };
}

async function mapSettlementPage(records: ComputeSettlementRecord[], advances: PersonalAdvanceRecord[]) {
    const users = await getPublicUsersByIds([...new Set(advances.map((advance) => advance.userId))]);
    const userMap = new Map(users.map((user) => [user.id, user]));
    return Promise.all(records.map((record) => toSettlement({ record, advances: advances.filter((advance) => advance.orderId === record.orderId) }, userMap)));
}

async function toSettlement(bundle: SettlementBundle, userMap?: Map<string, { id: string; accountId?: string; displayName?: string }>): Promise<ComputeSettlement> {
    const users = userMap || new Map((await getPublicUsersByIds([...new Set(bundle.advances.map((advance) => advance.userId))])).map((user) => [user.id, user]));
    return {
        id: bundle.record.id,
        groupId: bundle.record.groupId,
        orderId: bundle.record.orderId,
        status: bundle.record.status,
        unusedPersonalPointsReturned: bundle.record.unusedPersonalPointsReturned,
        consumedPersonalPointsPending: bundle.record.consumedPersonalPointsPending,
        confirmedPersonalPointsReturned: bundle.record.confirmedPersonalPointsReturned,
        advances: bundle.advances.map((advance) => toSettlementAdvance(advance, users)),
        createdAt: bundle.record.createdAt,
        updatedAt: bundle.record.updatedAt,
    };
}

function toSettlementAdvance(advance: PersonalAdvanceRecord, users: Map<string, { id: string; accountId?: string; displayName?: string }>): ComputeSettlementAdvance {
    const user = users.get(advance.userId);
    return {
        id: advance.id,
        accountId: user?.accountId || "",
        displayName: user?.displayName || "成员信息不可用",
        originalPoints: advance.originalPoints,
        consumedPoints: advance.consumedPoints,
        unusedPoints: Math.max(0, advance.originalPoints - advance.consumedPoints),
        returnedPoints: advance.returnedPoints,
        status: advance.status,
    };
}

function consumedReturnedFromAdvance(advance: PersonalAdvanceRecord) {
    return Math.max(0, advance.returnedPoints - Math.max(0, advance.originalPoints - advance.consumedPoints));
}

function walletMutationOrder(advances: PersonalAdvanceRecord[]) {
    return [...advances].sort((left, right) => left.userId.localeCompare(right.userId) || left.id.localeCompare(right.id));
}

async function restoreSnapshots(authBefore: Partial<AuthDatabase>, schoolBefore: Record<string, unknown>, computeBefore: Record<string, unknown>) {
    await Promise.all([writeJsonDataFile(AUTH_DATA_FILE, authBefore), writeJsonDataFile(SCHOOL_DOMAIN_DATA_FILE, schoolBefore), writeJsonDataFile(SCHOOL_COMPUTE_DATA_FILE, computeBefore)]);
}
