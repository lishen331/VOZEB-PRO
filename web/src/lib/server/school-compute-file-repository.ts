import { readJsonDataFile, withJsonDataFileLock, writeJsonDataFile } from "@/lib/server/data-adapter";
import type { PageQuery, Page } from "./school-domain-repository";
import type {
    ComputeAllocationRequestRecord,
    ComputeAllocationRequestUpdate,
    ComputeConsumptionRecord,
    ComputeLedgerPageQuery,
    ComputePoolPageQuery,
    ComputeSettlementRecord,
    ComputeSettlementUpdate,
    PersonalAdvanceRecord,
    PersonalAdvanceUpdate,
    ProductionGroupMemberRecord,
    ProductionGroupPageQuery,
    ProductionGroupProjectRecord,
    ProductionGroupRecord,
    ProductionGroupUpdate,
    SchoolComputeLedgerRecord,
    SchoolComputePoolRecord,
    SchoolComputeRepository,
} from "./school-compute-repository";

export const SCHOOL_COMPUTE_DATA_FILE = "school-compute.json";

type SchoolComputeFile = {
    version: 1;
    pools: SchoolComputePoolRecord[];
    ledgerEntries: SchoolComputeLedgerRecord[];
    groups: ProductionGroupRecord[];
    groupMembers: ProductionGroupMemberRecord[];
    allocationRequests: ComputeAllocationRequestRecord[];
    groupProjects: ProductionGroupProjectRecord[];
    personalAdvances: PersonalAdvanceRecord[];
    settlements: ComputeSettlementRecord[];
    consumptions: ComputeConsumptionRecord[];
};

const EMPTY_FILE: SchoolComputeFile = { version: 1, pools: [], ledgerEntries: [], groups: [], groupMembers: [], allocationRequests: [], groupProjects: [], personalAdvances: [], settlements: [], consumptions: [] };
let mutationQueue = Promise.resolve();

export function createFileSchoolComputeRepository(): SchoolComputeRepository {
    return new FileSchoolComputeRepository();
}

export async function mutateFileSchoolComputeInsideLock<T>(operation: (repository: SchoolComputeRepository) => Promise<T>): Promise<T> {
    return withJsonDataFileLock(SCHOOL_COMPUTE_DATA_FILE, async () => {
        const state = normalize(await readJsonDataFile(SCHOOL_COMPUTE_DATA_FILE, EMPTY_FILE));
        const result = await operation(new FileSchoolComputeRepository(state));
        await writeJsonDataFile(SCHOOL_COMPUTE_DATA_FILE, state);
        return result;
    });
}

class FileSchoolComputeRepository implements SchoolComputeRepository {
    constructor(private readonly state?: SchoolComputeFile) {}

    async getPool(schoolId: string) {
        return detached((await this.read()).pools.find((item) => item.schoolId === schoolId));
    }

    upsertPool(record: SchoolComputePoolRecord) {
        assertBalance(record.availablePoints);
        return this.mutate((state) => {
            const current = state.pools.find((item) => item.schoolId === record.schoolId);
            if (current) Object.assign(current, clone(record));
            else state.pools.push(clone(record));
            return clone(current || record);
        });
    }

    async listPools(input: ComputePoolPageQuery) {
        const keyword = input.keyword?.trim().toLowerCase() || "";
        const records = (await this.read()).pools.filter((item) => (!input.status || item.status === input.status) && (!keyword || item.schoolId.toLowerCase().includes(keyword)));
        return paginate(records, input);
    }

    async listPoolsBySchoolIds(schoolIds: string[]) {
        const selected = new Set(schoolIds);
        return (await this.read()).pools
            .filter((item) => selected.has(item.schoolId))
            .sort((a, b) => a.schoolId.localeCompare(b.schoolId))
            .map(clone);
    }

    creditPool(schoolId: string, amount: number, entry: SchoolComputeLedgerRecord) {
        assertMoney(amount, true);
        return this.mutate((state) => {
            if (state.ledgerEntries.some((item) => item.idempotencyKey === entry.idempotencyKey)) return requirePool(state, schoolId);
            const pool = requirePool(state, schoolId);
            if (pool.status !== "active") throw new Error("学校算力池不存在或已冻结");
            pool.availablePoints = money(pool.availablePoints + amount);
            pool.updatedAt = entry.createdAt;
            insertLedger(state, { ...entry, schoolId, amount, balanceAfter: pool.availablePoints });
            return clone(pool);
        });
    }

    adjustPool(schoolId: string, amount: number, entry: SchoolComputeLedgerRecord) {
        assertMoney(amount, false);
        return this.mutate((state) => {
            if (state.ledgerEntries.some((item) => item.idempotencyKey === entry.idempotencyKey)) return requirePool(state, schoolId);
            const pool = requirePool(state, schoolId);
            if (pool.status !== "active" || pool.availablePoints + amount < 0) throw new Error("学校算力池不存在、已冻结或余额不足");
            pool.availablePoints = money(pool.availablePoints + amount);
            pool.updatedAt = entry.createdAt;
            insertLedger(state, { ...entry, schoolId, amount, balanceAfter: pool.availablePoints });
            return clone(pool);
        });
    }

    allocateToGroup(schoolId: string, groupId: string, amount: number, entry: SchoolComputeLedgerRecord) {
        assertMoney(amount, true);
        return this.mutate((state) => {
            const duplicate = state.ledgerEntries.some((item) => item.idempotencyKey === entry.idempotencyKey);
            const pool = requirePool(state, schoolId);
            const group = requireGroup(state, schoolId, groupId);
            if (duplicate) return { pool: clone(pool), group: clone(group) };
            if (pool.status !== "active" || pool.availablePoints < amount) throw new Error("学校算力池不存在、已冻结或余额不足");
            if (!["draft", "active"].includes(group.status)) throw new Error("制作小组不存在或已关闭");
            pool.availablePoints = money(pool.availablePoints - amount);
            group.schoolPointsBalance = money(group.schoolPointsBalance + amount);
            pool.updatedAt = group.updatedAt = entry.createdAt;
            insertLedger(state, { ...entry, schoolId, groupId, amount: entry.amount || -amount, balanceAfter: pool.availablePoints });
            return { pool: clone(pool), group: clone(group) };
        });
    }

    releaseGroupPoints(schoolId: string, groupId: string, amount: number, entry: SchoolComputeLedgerRecord) {
        assertMoney(amount, true);
        return this.mutate((state) => {
            const duplicate = state.ledgerEntries.some((item) => item.idempotencyKey === entry.idempotencyKey);
            const pool = requirePool(state, schoolId);
            const group = requireGroup(state, schoolId, groupId);
            if (duplicate) return { pool: clone(pool), group: clone(group) };
            if (group.schoolPointsBalance < amount) throw new Error("制作小组余额不足");
            group.schoolPointsBalance = money(group.schoolPointsBalance - amount);
            pool.availablePoints = money(pool.availablePoints + amount);
            pool.updatedAt = group.updatedAt = entry.createdAt;
            insertLedger(state, { ...entry, schoolId, groupId, amount: entry.amount || amount, balanceAfter: pool.availablePoints });
            return { pool: clone(pool), group: clone(group) };
        });
    }

    consumeGroupSchoolPoints(schoolId: string, groupId: string, amount: number, entry: SchoolComputeLedgerRecord) {
        assertMoney(amount, true);
        return this.mutate((state) => {
            const group = requireGroup(state, schoolId, groupId);
            if (state.ledgerEntries.some((item) => item.idempotencyKey === entry.idempotencyKey)) return clone(group);
            if (!["draft", "active"].includes(group.status) || group.schoolPointsBalance < amount) throw new Error("制作小组不存在、已冻结或余额不足");
            group.schoolPointsBalance = money(group.schoolPointsBalance - amount);
            group.updatedAt = entry.createdAt;
            insertLedger(state, { ...entry, schoolId, groupId, amount: entry.amount || -amount, balanceAfter: group.schoolPointsBalance });
            return clone(group);
        });
    }

    refundGroupSchoolPoints(schoolId: string, groupId: string, amount: number, entry: SchoolComputeLedgerRecord) {
        assertMoney(amount, true);
        return this.mutate((state) => {
            const group = requireGroup(state, schoolId, groupId);
            if (state.ledgerEntries.some((item) => item.idempotencyKey === entry.idempotencyKey)) return clone(group);
            group.schoolPointsBalance = money(group.schoolPointsBalance + amount);
            group.updatedAt = entry.createdAt;
            insertLedger(state, { ...entry, schoolId, groupId, amount: entry.amount || amount, balanceAfter: group.schoolPointsBalance });
            return clone(group);
        });
    }

    async listLedger(schoolId: string, input: ComputeLedgerPageQuery) {
        const records = (await this.read()).ledgerEntries.filter(
            (item) => item.schoolId === schoolId && (!input.groupId || item.groupId === input.groupId) && (!input.orderId || item.orderId === input.orderId) && (!input.type || item.type === input.type),
        );
        return paginate(records, input);
    }

    async getGroup(schoolId: string, groupId: string) {
        return detached((await this.read()).groups.find((item) => item.schoolId === schoolId && item.id === groupId));
    }

    async listGroups(schoolId: string, input: ProductionGroupPageQuery) {
        const keyword = input.keyword?.trim().toLowerCase() || "";
        const records = (await this.read()).groups.filter((item) => item.schoolId === schoolId && (!input.status || item.status === input.status) && (!keyword || `${item.id} ${item.name}`.toLowerCase().includes(keyword)));
        return paginate(records, input);
    }

    insertGroup(record: ProductionGroupRecord) {
        return this.mutate((state) => {
            if (state.groups.some((item) => item.id === record.id)) throw new Error(`记录已存在：${record.id}`);
            if (state.groups.some((item) => item.schoolId === record.schoolId && item.leaderMembershipId === record.leaderMembershipId && item.status !== "archived")) throw new Error("成员已担任其他制作小组负责人");
            state.groups.push(clone(record));
            return clone(record);
        });
    }

    updateGroup(schoolId: string, groupId: string, patch: ProductionGroupUpdate) {
        return this.mutate((state) => {
            const group = state.groups.find((item) => item.schoolId === schoolId && item.id === groupId);
            if (!group) return null;
            Object.assign(group, patch);
            return clone(group);
        });
    }

    replaceGroupMembers(schoolId: string, groupId: string, records: ProductionGroupMemberRecord[]) {
        return this.mutate((state) => {
            requireGroup(state, schoolId, groupId);
            if (records.some((item) => item.schoolId !== schoolId || item.groupId !== groupId)) throw new Error("制作小组成员不属于当前学校");
            if (new Set(records.map((item) => item.membershipId)).size !== records.length) throw new Error("制作小组成员不能重复");
            state.groupMembers = state.groupMembers.filter((item) => item.schoolId !== schoolId || item.groupId !== groupId);
            state.groupMembers.push(...records.map(clone));
        });
    }

    async listGroupMembers(schoolId: string, groupId: string, input: PageQuery) {
        return paginate(
            (await this.read()).groupMembers.filter((item) => item.schoolId === schoolId && item.groupId === groupId),
            input,
        );
    }

    async getGroupProjectByProject(projectType: "canvas" | "drama", projectId: string) {
        return detached((await this.read()).groupProjects.find((item) => item.projectType === projectType && item.projectId === projectId && !item.settledAt));
    }

    insertGroupProject(record: ProductionGroupProjectRecord) {
        return this.mutate((state) => {
            if (state.groupProjects.some((item) => item.projectType === record.projectType && item.projectId === record.projectId && !item.settledAt)) throw new Error("项目已有未结算的制作小组关联");
            state.groupProjects.push(clone(record));
            return clone(record);
        });
    }

    insertAllocationRequest(record: ComputeAllocationRequestRecord) {
        return this.insertRecord("allocationRequests", record);
    }
    async getAllocationRequest(schoolId: string, requestId: string) {
        return detached((await this.read()).allocationRequests.find((item) => item.schoolId === schoolId && item.id === requestId));
    }
    async listAllocationRequests(schoolId: string, groupId: string, input: PageQuery) {
        return paginate(
            (await this.read()).allocationRequests.filter((item) => item.schoolId === schoolId && item.groupId === groupId),
            input,
        );
    }
    updateAllocationRequest(schoolId: string, requestId: string, patch: ComputeAllocationRequestUpdate) {
        return this.updateRecord<ComputeAllocationRequestRecord>("allocationRequests", (item) => item.schoolId === schoolId && item.id === requestId, patch);
    }

    insertPersonalAdvance(record: PersonalAdvanceRecord) {
        return this.insertRecord("personalAdvances", record);
    }
    async getPersonalAdvance(schoolId: string, advanceId: string) {
        return detached((await this.read()).personalAdvances.find((item) => item.schoolId === schoolId && item.id === advanceId));
    }
    async listPersonalAdvances(schoolId: string, groupId: string, input: PageQuery & { orderId?: string; membershipId?: string }) {
        return paginate(
            (await this.read()).personalAdvances.filter((item) => item.schoolId === schoolId && item.groupId === groupId && (!input.orderId || item.orderId === input.orderId) && (!input.membershipId || item.membershipId === input.membershipId)),
            input,
        );
    }
    async listSpendableAdvances(schoolId: string, groupId: string, orderId: string) {
        return (await this.read()).personalAdvances
            .filter((item) => item.schoolId === schoolId && item.groupId === groupId && item.orderId === orderId && ["active", "partially_consumed"].includes(item.status) && item.remainingPoints > 0)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
            .map(clone);
    }
    updatePersonalAdvance(id: string, patch: PersonalAdvanceUpdate) {
        return this.updateRecord<PersonalAdvanceRecord>("personalAdvances", (item) => item.id === id, patch);
    }

    insertConsumption(record: ComputeConsumptionRecord) {
        return this.mutate((state) => {
            const existing = state.consumptions.find((item) => item.generationTaskId === record.generationTaskId && item.sourceType === record.sourceType && item.sourceId === record.sourceId);
            if (existing) return clone(existing);
            state.consumptions.push(clone(record));
            return clone(record);
        });
    }
    async listConsumptionsForGeneration(generationTaskId: string) {
        return (await this.read()).consumptions
            .filter((item) => item.generationTaskId === generationTaskId)
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
            .map(clone);
    }
    async listConsumptionsForOrder(schoolId: string, orderId: string, input: PageQuery) {
        return paginate(
            (await this.read()).consumptions.filter((item) => item.schoolId === schoolId && item.orderId === orderId),
            input,
        );
    }
    updateConsumption(id: string, status: ComputeConsumptionRecord["status"], updatedAt: string) {
        return this.mutate((state) => {
            const item = state.consumptions.find((entry) => entry.id === id);
            if (!item) return null;
            item.status = status;
            item.updatedAt = updatedAt;
            return clone(item);
        });
    }

    async getSettlement(schoolId: string, orderId: string) {
        return detached((await this.read()).settlements.find((item) => item.schoolId === schoolId && item.orderId === orderId));
    }
    insertSettlement(record: ComputeSettlementRecord) {
        return this.insertRecord("settlements", record);
    }
    async listSettlements(schoolId: string, groupId: string, input: PageQuery) {
        return paginate(
            (await this.read()).settlements.filter((item) => item.schoolId === schoolId && item.groupId === groupId),
            input,
        );
    }
    updateSettlement(schoolId: string, orderId: string, patch: ComputeSettlementUpdate) {
        return this.updateRecord<ComputeSettlementRecord>("settlements", (item) => item.schoolId === schoolId && item.orderId === orderId, patch);
    }

    insertLedgerEntry(record: SchoolComputeLedgerRecord) {
        return this.mutate((state) => {
            const existing = state.ledgerEntries.find((item) => item.idempotencyKey === record.idempotencyKey);
            if (existing) return clone(existing);
            state.ledgerEntries.push(clone(record));
            return clone(record);
        });
    }
    async getLedgerEntryByIdempotencyKey(key: string) {
        return detached((await this.read()).ledgerEntries.find((item) => item.idempotencyKey === key));
    }

    transact<T>(operation: (repository: SchoolComputeRepository) => Promise<T>): Promise<T> {
        if (this.state) return operation(this);
        return this.mutate((state) => operation(new FileSchoolComputeRepository(state)));
    }

    private read() {
        return this.state ? Promise.resolve(this.state) : readJsonDataFile(SCHOOL_COMPUTE_DATA_FILE, EMPTY_FILE).then(normalize);
    }
    private mutate<T>(operation: (state: SchoolComputeFile) => Promise<T> | T) {
        if (this.state) return Promise.resolve(operation(this.state));
        const pending = mutationQueue
            .catch(() => undefined)
            .then(() =>
                withJsonDataFileLock(SCHOOL_COMPUTE_DATA_FILE, async () => {
                    const state = normalize(await readJsonDataFile(SCHOOL_COMPUTE_DATA_FILE, EMPTY_FILE));
                    const result = await operation(state);
                    await writeJsonDataFile(SCHOOL_COMPUTE_DATA_FILE, state);
                    return result;
                }),
            );
        mutationQueue = pending.then(
            () => undefined,
            () => undefined,
        );
        return pending;
    }

    private insertRecord<K extends "allocationRequests" | "personalAdvances" | "settlements", T extends { id: string }>(key: K, record: T) {
        return this.mutate((state) => {
            if (state[key].some((item) => item.id === record.id)) throw new Error(`记录已存在：${record.id}`);
            state[key].push(clone(record) as never);
            return clone(record);
        });
    }
    private updateRecord<T extends ComputeAllocationRequestRecord | PersonalAdvanceRecord | ComputeSettlementRecord>(key: "allocationRequests" | "personalAdvances" | "settlements", predicate: (item: T) => boolean, patch: Partial<T>): Promise<T | null> {
        return this.mutate((state) => {
            const item = (state[key] as unknown as T[]).find(predicate);
            if (!item) return null;
            Object.assign(item, patch);
            return clone(item);
        });
    }
}

function normalize(value: Partial<SchoolComputeFile>): SchoolComputeFile {
    const source = value && typeof value === "object" ? value : {};
    return {
        version: 1,
        pools: arrayValue(source.pools),
        ledgerEntries: arrayValue(source.ledgerEntries),
        groups: arrayValue(source.groups),
        groupMembers: arrayValue(source.groupMembers),
        allocationRequests: arrayValue(source.allocationRequests),
        groupProjects: arrayValue(source.groupProjects),
        personalAdvances: arrayValue(source.personalAdvances),
        settlements: arrayValue(source.settlements),
        consumptions: arrayValue(source.consumptions),
    };
}
function arrayValue<T>(value: T[] | undefined): T[] {
    return Array.isArray(value) ? structuredClone(value) : [];
}
function clone<T>(value: T): T {
    return structuredClone(value);
}
function detached<T>(value: T | undefined): T | null {
    return value === undefined ? null : clone(value);
}
function money(value: number) {
    return Math.round(value * 100) / 100;
}
function assertMoney(value: number, positive: boolean) {
    if (!Number.isFinite(value) || (positive ? value <= 0 : value === 0)) throw new Error("算力点数无效");
}
function assertBalance(value: number) {
    if (!Number.isFinite(value) || value < 0) throw new Error("算力余额无效");
}
function requirePool(state: SchoolComputeFile, schoolId: string) {
    const pool = state.pools.find((item) => item.schoolId === schoolId);
    if (!pool) throw new Error("学校算力池不存在");
    return pool;
}
function requireGroup(state: SchoolComputeFile, schoolId: string, groupId: string) {
    const group = state.groups.find((item) => item.schoolId === schoolId && item.id === groupId);
    if (!group) throw new Error("制作小组不存在或不属于当前学校");
    return group;
}
function insertLedger(state: SchoolComputeFile, record: SchoolComputeLedgerRecord) {
    if (state.ledgerEntries.some((item) => item.idempotencyKey === record.idempotencyKey)) return;
    state.ledgerEntries.push(clone(record));
}
function paginate<T extends { id?: string; schoolId?: string; updatedAt?: string; createdAt?: string }>(records: T[], input: PageQuery): Page<T> {
    const page = Number.isFinite(input.page) && Number(input.page) > 0 ? Math.floor(Number(input.page)) : 1;
    const pageSize = Number.isFinite(input.pageSize) && Number(input.pageSize) > 0 ? Math.min(100, Math.floor(Number(input.pageSize))) : 20;
    const sorted = [...records].sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "") || (b.id || b.schoolId || "").localeCompare(a.id || a.schoolId || ""));
    return { items: sorted.slice((page - 1) * pageSize, page * pageSize).map(clone), total: sorted.length, page, pageSize };
}
