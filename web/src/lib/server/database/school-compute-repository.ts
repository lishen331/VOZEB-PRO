import type { QueryExecutor } from "./postgres";
import type { PageQuery } from "../school-domain-repository";
import { postgresQuery, withPostgresTransaction } from "./postgres";
import { isoValue, normalizePage, normalizePageSize, numberValue, optionalIso, optionalString, pageResult, stringValue } from "./repository-utils";
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
} from "../school-compute-repository";

export function createPostgresSchoolComputeRepository(executor?: QueryExecutor): SchoolComputeRepository {
    return new PostgresSchoolComputeRepository(executor || { query: postgresQuery }, !executor);
}

export class PostgresSchoolComputeRepository implements SchoolComputeRepository {
    constructor(
        private readonly db: QueryExecutor,
        private readonly startsTransactions = false,
    ) {}

    async getPool(schoolId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM school_compute_pools WHERE school_id = $1${forUpdate ? " FOR UPDATE" : ""}`, [schoolId]);
        return result.rows[0] ? mapPool(result.rows[0]) : null;
    }

    async upsertPool(record: SchoolComputePoolRecord) {
        assertBalance(record.availablePoints);
        const result = await this.db.query(
            `INSERT INTO school_compute_pools (school_id, available_points, status, created_at, updated_at)
             VALUES ($1, $2::numeric, $3, $4, $5)
             ON CONFLICT (school_id) DO UPDATE SET available_points = EXCLUDED.available_points, status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
             RETURNING *`,
            [record.schoolId, record.availablePoints, record.status, record.createdAt, record.updatedAt],
        );
        return mapPool(result.rows[0]);
    }

    async listPools(input: ComputePoolPageQuery) {
        const { page, pageSize, offset } = pagination(input);
        const values = [input.status || null, input.keyword?.trim() || null];
        const where = "WHERE ($1::text IS NULL OR status = $1) AND ($2::text IS NULL OR school_id ILIKE '%' || $2 || '%')";
        const [rows, count] = await Promise.all([
            this.db.query(`SELECT * FROM school_compute_pools ${where} ORDER BY updated_at DESC, school_id DESC LIMIT $3 OFFSET $4`, [...values, pageSize, offset]),
            this.db.query(`SELECT COUNT(*)::int AS total FROM school_compute_pools ${where}`, values),
        ]);
        return pageResult(rows.rows.map(mapPool), numberValue(count.rows[0]?.total), page, pageSize);
    }

    async listPoolsBySchoolIds(schoolIds: string[]) {
        if (!schoolIds.length) return [];
        const result = await this.db.query("SELECT * FROM school_compute_pools WHERE school_id = ANY($1::text[]) ORDER BY school_id", [schoolIds]);
        return result.rows.map(mapPool);
    }

    creditPool(schoolId: string, amount: number, entry: SchoolComputeLedgerRecord) {
        assertMoney(amount, true);
        return this.mutate(async (repository) => {
            const duplicate = await repository.getLedgerEntryByIdempotencyKey(entry.idempotencyKey);
            if (duplicate) return (await repository.getPool(schoolId)) || notFound("学校算力池不存在");
            const result = await repository.db.query("UPDATE school_compute_pools SET available_points = available_points + $2::numeric, updated_at = $3 WHERE school_id = $1 AND status = 'active' RETURNING *", [schoolId, amount, entry.createdAt]);
            if (!result.rows[0]) throw new Error("学校算力池不存在或已冻结");
            const pool = mapPool(result.rows[0]);
            await repository.insertLedgerEntry({ ...entry, schoolId, amount, balanceAfter: pool.availablePoints });
            return pool;
        });
    }

    adjustPool(schoolId: string, amount: number, entry: SchoolComputeLedgerRecord) {
        assertMoney(amount, false);
        return this.mutate(async (repository) => {
            const duplicate = await repository.getLedgerEntryByIdempotencyKey(entry.idempotencyKey);
            if (duplicate) return (await repository.getPool(schoolId)) || notFound("学校算力池不存在");
            const result = await repository.db.query("UPDATE school_compute_pools SET available_points = available_points + $2::numeric, updated_at = $3 WHERE school_id = $1 AND status = 'active' AND available_points + $2::numeric >= 0 RETURNING *", [
                schoolId,
                amount,
                entry.createdAt,
            ]);
            if (!result.rows[0]) throw new Error("学校算力池不存在、已冻结或余额不足");
            const pool = mapPool(result.rows[0]);
            await repository.insertLedgerEntry({ ...entry, schoolId, amount, balanceAfter: pool.availablePoints });
            return pool;
        });
    }

    allocateToGroup(schoolId: string, groupId: string, amount: number, entry: SchoolComputeLedgerRecord) {
        assertMoney(amount, true);
        return this.mutate(async (repository) => {
            if (await repository.getLedgerEntryByIdempotencyKey(entry.idempotencyKey)) {
                const pool = await repository.getPool(schoolId);
                const group = await repository.getGroup(schoolId, groupId);
                if (!pool || !group) throw new Error("学校算力池或制作小组不存在");
                return { pool, group };
            }
            const poolResult = await repository.db.query("UPDATE school_compute_pools SET available_points = available_points - $3::numeric, updated_at = $4 WHERE school_id = $1 AND status = 'active' AND available_points >= $3::numeric RETURNING *", [
                schoolId,
                groupId,
                amount,
                entry.createdAt,
            ]);
            if (!poolResult.rows[0]) throw new Error("学校算力池不存在、已冻结或余额不足");
            const groupResult = await repository.db.query("UPDATE school_production_groups SET school_points_balance = school_points_balance + $3::numeric, updated_at = $4 WHERE school_id = $1 AND id = $2 AND status IN ('draft', 'active') RETURNING *", [
                schoolId,
                groupId,
                amount,
                entry.createdAt,
            ]);
            if (!groupResult.rows[0]) throw new Error("制作小组不存在或已关闭");
            const pool = mapPool(poolResult.rows[0]);
            const group = mapGroup(groupResult.rows[0]);
            await repository.insertLedgerEntry({ ...entry, schoolId, groupId, amount: entry.amount || -amount, balanceAfter: pool.availablePoints });
            return { pool, group };
        });
    }

    releaseGroupPoints(schoolId: string, groupId: string, amount: number, entry: SchoolComputeLedgerRecord) {
        assertMoney(amount, true);
        return this.mutate(async (repository) => {
            if (await repository.getLedgerEntryByIdempotencyKey(entry.idempotencyKey)) {
                const pool = await repository.getPool(schoolId);
                const group = await repository.getGroup(schoolId, groupId);
                if (!pool || !group) throw new Error("学校算力池或制作小组不存在");
                return { pool, group };
            }
            const groupResult = await repository.db.query(
                "UPDATE school_production_groups SET school_points_balance = school_points_balance - $3::numeric, updated_at = $4 WHERE school_id = $1 AND id = $2 AND school_points_balance >= $3::numeric RETURNING *",
                [schoolId, groupId, amount, entry.createdAt],
            );
            if (!groupResult.rows[0]) throw new Error("制作小组不存在或余额不足");
            const poolResult = await repository.db.query("UPDATE school_compute_pools SET available_points = available_points + $2::numeric, updated_at = $3 WHERE school_id = $1 RETURNING *", [schoolId, amount, entry.createdAt]);
            if (!poolResult.rows[0]) throw new Error("学校算力池不存在");
            const pool = mapPool(poolResult.rows[0]);
            const group = mapGroup(groupResult.rows[0]);
            await repository.insertLedgerEntry({ ...entry, schoolId, groupId, amount: entry.amount || amount, balanceAfter: pool.availablePoints });
            return { pool, group };
        });
    }

    consumeGroupSchoolPoints(schoolId: string, groupId: string, amount: number, entry: SchoolComputeLedgerRecord) {
        assertMoney(amount, true);
        return this.mutate(async (repository) => {
            if (await repository.getLedgerEntryByIdempotencyKey(entry.idempotencyKey)) return (await repository.getGroup(schoolId, groupId)) || notFound("制作小组不存在");
            const result = await repository.db.query(
                "UPDATE school_production_groups SET school_points_balance = school_points_balance - $3::numeric, updated_at = $4 WHERE school_id = $1 AND id = $2 AND status IN ('draft', 'active') AND school_points_balance >= $3::numeric RETURNING *",
                [schoolId, groupId, amount, entry.createdAt],
            );
            if (!result.rows[0]) throw new Error("制作小组不存在、已冻结或余额不足");
            const group = mapGroup(result.rows[0]);
            await repository.insertLedgerEntry({ ...entry, schoolId, groupId, amount: entry.amount || -amount, balanceAfter: group.schoolPointsBalance });
            return group;
        });
    }

    refundGroupSchoolPoints(schoolId: string, groupId: string, amount: number, entry: SchoolComputeLedgerRecord) {
        assertMoney(amount, true);
        return this.mutate(async (repository) => {
            if (await repository.getLedgerEntryByIdempotencyKey(entry.idempotencyKey)) return (await repository.getGroup(schoolId, groupId)) || notFound("制作小组不存在");
            const result = await repository.db.query("UPDATE school_production_groups SET school_points_balance = school_points_balance + $3::numeric, updated_at = $4 WHERE school_id = $1 AND id = $2 RETURNING *", [
                schoolId,
                groupId,
                amount,
                entry.createdAt,
            ]);
            if (!result.rows[0]) throw new Error("制作小组不存在");
            const group = mapGroup(result.rows[0]);
            await repository.insertLedgerEntry({ ...entry, schoolId, groupId, amount: entry.amount || amount, balanceAfter: group.schoolPointsBalance });
            return group;
        });
    }

    async listLedger(schoolId: string, input: ComputeLedgerPageQuery) {
        const { page, pageSize, offset } = pagination(input);
        const values: unknown[] = [schoolId, input.groupId || null, input.orderId || null, input.type || null];
        const where = "WHERE school_id = $1 AND ($2::text IS NULL OR group_id = $2) AND ($3::text IS NULL OR order_id = $3) AND ($4::text IS NULL OR type = $4)";
        const [rows, count] = await Promise.all([
            this.db.query(`SELECT * FROM school_compute_ledger_entries ${where} ORDER BY created_at DESC, id DESC LIMIT $5 OFFSET $6`, [...values, pageSize, offset]),
            this.db.query(`SELECT COUNT(*)::int AS total FROM school_compute_ledger_entries ${where}`, values),
        ]);
        return pageResult(rows.rows.map(mapLedger), numberValue(count.rows[0]?.total), page, pageSize);
    }

    async getGroup(schoolId: string, groupId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM school_production_groups WHERE school_id = $1 AND id = $2${forUpdate ? " FOR UPDATE" : ""}`, [schoolId, groupId]);
        return result.rows[0] ? mapGroup(result.rows[0]) : null;
    }

    async listGroups(schoolId: string, input: ProductionGroupPageQuery) {
        const { page, pageSize, offset } = pagination(input);
        const values = [schoolId, input.status || null, input.keyword?.trim() || null];
        const where = "WHERE school_id = $1 AND ($2::text IS NULL OR status = $2) AND ($3::text IS NULL OR id ILIKE '%' || $3 || '%' OR name ILIKE '%' || $3 || '%')";
        const [rows, count] = await Promise.all([
            this.db.query(`SELECT * FROM school_production_groups ${where} ORDER BY updated_at DESC, id DESC LIMIT $4 OFFSET $5`, [...values, pageSize, offset]),
            this.db.query(`SELECT COUNT(*)::int AS total FROM school_production_groups ${where}`, values),
        ]);
        return pageResult(rows.rows.map(mapGroup), numberValue(count.rows[0]?.total), page, pageSize);
    }

    async insertGroup(record: ProductionGroupRecord) {
        const result = await this.db.query(
            "INSERT INTO school_production_groups (id, school_id, name, description, leader_membership_id, status, school_points_balance, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8, $9) RETURNING *",
            [record.id, record.schoolId, record.name, record.description, record.leaderMembershipId, record.status, record.schoolPointsBalance, record.createdAt, record.updatedAt],
        );
        return mapGroup(result.rows[0]);
    }

    async updateGroup(schoolId: string, groupId: string, patch: ProductionGroupUpdate) {
        const values: unknown[] = [schoolId, groupId, patch.updatedAt];
        const assignments = ["updated_at = $3"];
        addUpdate(assignments, values, "name", patch.name);
        addUpdate(assignments, values, "description", patch.description);
        addUpdate(assignments, values, "leader_membership_id", patch.leaderMembershipId);
        addUpdate(assignments, values, "status", patch.status);
        addUpdate(assignments, values, "school_points_balance", patch.schoolPointsBalance, "::numeric");
        const result = await this.db.query(`UPDATE school_production_groups SET ${assignments.join(", ")} WHERE school_id = $1 AND id = $2 RETURNING *`, values);
        return result.rows[0] ? mapGroup(result.rows[0]) : null;
    }

    async replaceGroupMembers(schoolId: string, groupId: string, records: ProductionGroupMemberRecord[]) {
        return this.transact(async (repository) => {
            const postgresRepository = repository as PostgresSchoolComputeRepository;
            if (!(await repository.getGroup(schoolId, groupId, true))) throw new Error("制作小组不存在");
            if (records.some((record) => record.schoolId !== schoolId || record.groupId !== groupId)) throw new Error("制作小组成员不属于当前学校");
            const membershipIds = [...new Set(records.map((record) => record.membershipId))];
            if (membershipIds.length !== records.length) throw new Error("制作小组成员不能重复");
            if (membershipIds.length) {
                const members = await postgresRepository.db.query("SELECT COUNT(*)::int AS total FROM school_memberships WHERE school_id = $1 AND id = ANY($2::text[])", [schoolId, membershipIds]);
                if (numberValue(members.rows[0]?.total) !== membershipIds.length) throw new Error("制作小组只能添加本学校成员");
            }
            await postgresRepository.db.query("DELETE FROM school_production_group_members WHERE school_id = $1 AND group_id = $2", [schoolId, groupId]);
            for (const record of records)
                await postgresRepository.db.query("INSERT INTO school_production_group_members (id, school_id, group_id, membership_id, role, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [
                    record.id,
                    schoolId,
                    groupId,
                    record.membershipId,
                    record.role,
                    record.createdAt,
                    record.updatedAt,
                ]);
        });
    }

    async listGroupMembers(schoolId: string, groupId: string, input: PageQuery) {
        const { page, pageSize, offset } = pagination(input);
        const values = [schoolId, groupId];
        const [rows, count] = await Promise.all([
            this.db.query("SELECT * FROM school_production_group_members WHERE school_id = $1 AND group_id = $2 ORDER BY created_at ASC, id ASC LIMIT $3 OFFSET $4", [...values, pageSize, offset]),
            this.db.query("SELECT COUNT(*)::int AS total FROM school_production_group_members WHERE school_id = $1 AND group_id = $2", values),
        ]);
        return pageResult(rows.rows.map(mapMember), numberValue(count.rows[0]?.total), page, pageSize);
    }

    async getGroupProjectByProject(projectType: "canvas" | "drama", projectId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM school_compute_group_projects WHERE project_type = $1 AND project_id = $2 AND settled_at IS NULL${forUpdate ? " FOR UPDATE" : ""}`, [projectType, projectId]);
        return result.rows[0] ? mapProject(result.rows[0]) : null;
    }

    async insertGroupProject(record: ProductionGroupProjectRecord) {
        const result = await this.db.query(
            "INSERT INTO school_compute_group_projects (id, school_id, group_id, order_id, project_type, project_id, created_by_membership_id, settled_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *",
            [record.id, record.schoolId, record.groupId, record.orderId, record.projectType, record.projectId, record.createdByMembershipId, record.settledAt || null, record.createdAt, record.updatedAt],
        );
        return mapProject(result.rows[0]);
    }

    async insertAllocationRequest(record: ComputeAllocationRequestRecord) {
        const result = await this.db.query(
            "INSERT INTO school_compute_allocation_requests (id, school_id, group_id, order_id, requested_by_membership_id, amount, reason, status, review_note, reviewed_by_membership_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6::numeric, $7, $8, $9, $10, $11, $12) RETURNING *",
            [record.id, record.schoolId, record.groupId, record.orderId, record.requestedByMembershipId, record.amount, record.reason, record.status, record.reviewNote, record.reviewedByMembershipId || null, record.createdAt, record.updatedAt],
        );
        return mapAllocationRequest(result.rows[0]);
    }

    async getAllocationRequest(schoolId: string, requestId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM school_compute_allocation_requests WHERE school_id = $1 AND id = $2${forUpdate ? " FOR UPDATE" : ""}`, [schoolId, requestId]);
        return result.rows[0] ? mapAllocationRequest(result.rows[0]) : null;
    }

    async listAllocationRequests(schoolId: string, groupId: string, input: PageQuery) {
        return this.tenantPage("school_compute_allocation_requests", [schoolId, groupId], input, mapAllocationRequest, "school_id = $1 AND group_id = $2");
    }

    async updateAllocationRequest(schoolId: string, requestId: string, patch: ComputeAllocationRequestUpdate) {
        const values: unknown[] = [schoolId, requestId, patch.updatedAt];
        const assignments = ["updated_at = $3"];
        addUpdate(assignments, values, "status", patch.status);
        addUpdate(assignments, values, "review_note", patch.reviewNote);
        addUpdate(assignments, values, "reviewed_by_membership_id", patch.reviewedByMembershipId);
        const result = await this.db.query(`UPDATE school_compute_allocation_requests SET ${assignments.join(", ")} WHERE school_id = $1 AND id = $2 RETURNING *`, values);
        return result.rows[0] ? mapAllocationRequest(result.rows[0]) : null;
    }

    async insertPersonalAdvance(record: PersonalAdvanceRecord) {
        const result = await this.db.query(
            "INSERT INTO school_compute_personal_advances (id, school_id, group_id, order_id, membership_id, user_id, original_points, consumed_points, remaining_points, returned_points, status, point_record_id, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7::numeric, $8::numeric, $9::numeric, $10::numeric, $11, $12, $13, $14) RETURNING *",
            [
                record.id,
                record.schoolId,
                record.groupId,
                record.orderId,
                record.membershipId,
                record.userId,
                record.originalPoints,
                record.consumedPoints,
                record.remainingPoints,
                record.returnedPoints,
                record.status,
                record.pointRecordId,
                record.createdAt,
                record.updatedAt,
            ],
        );
        return mapAdvance(result.rows[0]);
    }

    async getPersonalAdvance(schoolId: string, advanceId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM school_compute_personal_advances WHERE school_id = $1 AND id = $2${forUpdate ? " FOR UPDATE" : ""}`, [schoolId, advanceId]);
        return result.rows[0] ? mapAdvance(result.rows[0]) : null;
    }

    async listPersonalAdvances(schoolId: string, groupId: string, input: PageQuery & { orderId?: string; membershipId?: string }) {
        const { page, pageSize, offset } = pagination(input);
        const values = [schoolId, groupId, input.orderId || null, input.membershipId || null];
        const where = "WHERE school_id = $1 AND group_id = $2 AND ($3::text IS NULL OR order_id = $3) AND ($4::text IS NULL OR membership_id = $4)";
        const [rows, count] = await Promise.all([
            this.db.query(`SELECT * FROM school_compute_personal_advances ${where} ORDER BY created_at ASC, id ASC LIMIT $5 OFFSET $6`, [...values, pageSize, offset]),
            this.db.query(`SELECT COUNT(*)::int AS total FROM school_compute_personal_advances ${where}`, values),
        ]);
        return pageResult(rows.rows.map(mapAdvance), numberValue(count.rows[0]?.total), page, pageSize);
    }

    async listSpendableAdvances(schoolId: string, groupId: string, orderId: string, forUpdate = false) {
        const result = await this.db.query(
            `SELECT * FROM school_compute_personal_advances WHERE school_id = $1 AND group_id = $2 AND order_id = $3 AND status IN ('active', 'partially_consumed') AND remaining_points > 0::numeric ORDER BY created_at ASC, id ASC${forUpdate ? " FOR UPDATE" : ""}`,
            [schoolId, groupId, orderId],
        );
        return result.rows.map(mapAdvance);
    }

    async updatePersonalAdvance(id: string, patch: PersonalAdvanceUpdate) {
        const values: unknown[] = [id, patch.updatedAt];
        const assignments = ["updated_at = $2"];
        addUpdate(assignments, values, "consumed_points", patch.consumedPoints, "::numeric");
        addUpdate(assignments, values, "remaining_points", patch.remainingPoints, "::numeric");
        addUpdate(assignments, values, "returned_points", patch.returnedPoints, "::numeric");
        addUpdate(assignments, values, "status", patch.status);
        const result = await this.db.query(`UPDATE school_compute_personal_advances SET ${assignments.join(", ")} WHERE id = $1 RETURNING *`, values);
        return result.rows[0] ? mapAdvance(result.rows[0]) : null;
    }

    async insertConsumption(record: ComputeConsumptionRecord) {
        const result = await this.db.query(
            "INSERT INTO school_compute_consumptions (id, school_id, group_id, order_id, generation_task_id, user_id, source_type, source_id, amount, status, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::numeric, $10, $11, $12) ON CONFLICT (generation_task_id, source_type, source_id) DO UPDATE SET amount = school_compute_consumptions.amount RETURNING *",
            [record.id, record.schoolId, record.groupId, record.orderId, record.generationTaskId, record.userId, record.sourceType, record.sourceId, record.amount, record.status, record.createdAt, record.updatedAt],
        );
        return mapConsumption(result.rows[0]);
    }

    async listConsumptionsForGeneration(generationTaskId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM school_compute_consumptions WHERE generation_task_id = $1 ORDER BY created_at ASC, id ASC${forUpdate ? " FOR UPDATE" : ""}`, [generationTaskId]);
        return result.rows.map(mapConsumption);
    }

    async listConsumptionsForOrder(schoolId: string, orderId: string, input: PageQuery) {
        return this.tenantPage("school_compute_consumptions", [schoolId, orderId], input, mapConsumption, "school_id = $1 AND order_id = $2");
    }

    async updateConsumption(id: string, status: ComputeConsumptionRecord["status"], updatedAt: string) {
        const result = await this.db.query("UPDATE school_compute_consumptions SET status = $2, updated_at = $3 WHERE id = $1 RETURNING *", [id, status, updatedAt]);
        return result.rows[0] ? mapConsumption(result.rows[0]) : null;
    }

    async getSettlement(schoolId: string, orderId: string, forUpdate = false) {
        const result = await this.db.query(`SELECT * FROM school_compute_settlements WHERE school_id = $1 AND order_id = $2${forUpdate ? " FOR UPDATE" : ""}`, [schoolId, orderId]);
        return result.rows[0] ? mapSettlement(result.rows[0]) : null;
    }

    async insertSettlement(record: ComputeSettlementRecord) {
        const result = await this.db.query(
            "INSERT INTO school_compute_settlements (id, school_id, group_id, order_id, status, unused_personal_points_returned, consumed_personal_points_pending, confirmed_personal_points_returned, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8::numeric, $9, $10) RETURNING *",
            [record.id, record.schoolId, record.groupId, record.orderId, record.status, record.unusedPersonalPointsReturned, record.consumedPersonalPointsPending, record.confirmedPersonalPointsReturned, record.createdAt, record.updatedAt],
        );
        return mapSettlement(result.rows[0]);
    }

    async listSettlements(schoolId: string, groupId: string, input: PageQuery) {
        return this.tenantPage("school_compute_settlements", [schoolId, groupId], input, mapSettlement, "school_id = $1 AND group_id = $2");
    }

    async updateSettlement(schoolId: string, orderId: string, patch: ComputeSettlementUpdate) {
        const values: unknown[] = [schoolId, orderId, patch.updatedAt];
        const assignments = ["updated_at = $3"];
        addUpdate(assignments, values, "status", patch.status);
        addUpdate(assignments, values, "unused_personal_points_returned", patch.unusedPersonalPointsReturned, "::numeric");
        addUpdate(assignments, values, "consumed_personal_points_pending", patch.consumedPersonalPointsPending, "::numeric");
        addUpdate(assignments, values, "confirmed_personal_points_returned", patch.confirmedPersonalPointsReturned, "::numeric");
        const result = await this.db.query(`UPDATE school_compute_settlements SET ${assignments.join(", ")} WHERE school_id = $1 AND order_id = $2 RETURNING *`, values);
        return result.rows[0] ? mapSettlement(result.rows[0]) : null;
    }

    async insertLedgerEntry(record: SchoolComputeLedgerRecord) {
        const existing = await this.getLedgerEntryByIdempotencyKey(record.idempotencyKey);
        if (existing) return existing;
        const result = await this.db.query(
            "INSERT INTO school_compute_ledger_entries (id, school_id, group_id, order_id, type, amount, balance_after, idempotency_key, actor_user_id, source_entry_id, created_at) VALUES ($1, $2, $3, $4, $5, $6::numeric, $7::numeric, $8, $9, $10, $11) ON CONFLICT (idempotency_key) DO NOTHING RETURNING *",
            [record.id, record.schoolId, record.groupId || null, record.orderId || null, record.type, record.amount, record.balanceAfter, record.idempotencyKey, record.actorUserId || null, record.sourceEntryId || null, record.createdAt],
        );
        return result.rows[0] ? mapLedger(result.rows[0]) : (await this.getLedgerEntryByIdempotencyKey(record.idempotencyKey)) || record;
    }

    async getLedgerEntryByIdempotencyKey(key: string) {
        const result = await this.db.query("SELECT * FROM school_compute_ledger_entries WHERE idempotency_key = $1", [key]);
        return result.rows[0] ? mapLedger(result.rows[0]) : null;
    }

    transact<T>(operation: (repository: SchoolComputeRepository) => Promise<T>): Promise<T> {
        if (!this.startsTransactions) return operation(this);
        return withPostgresTransaction((executor) => operation(new PostgresSchoolComputeRepository(executor)));
    }

    private mutate<T>(operation: (repository: PostgresSchoolComputeRepository) => Promise<T>) {
        return this.startsTransactions ? withPostgresTransaction((executor) => operation(new PostgresSchoolComputeRepository(executor))) : operation(this);
    }

    private async tenantPage<T>(table: string, prefixValues: unknown[], input: PageQuery, mapper: (row: Record<string, unknown>) => T, wherePrefix: string) {
        const { page, pageSize, offset } = pagination(input);
        const [rows, count] = await Promise.all([
            this.db.query(`SELECT * FROM ${table} WHERE ${wherePrefix} ORDER BY created_at DESC, id DESC LIMIT $${prefixValues.length + 1} OFFSET $${prefixValues.length + 2}`, [...prefixValues, pageSize, offset]),
            this.db.query(`SELECT COUNT(*)::int AS total FROM ${table} WHERE ${wherePrefix}`, prefixValues),
        ]);
        return pageResult(rows.rows.map(mapper), numberValue(count.rows[0]?.total), page, pageSize);
    }
}

function pagination(input: PageQuery) {
    const page = normalizePage(input.page);
    const pageSize = normalizePageSize(input.pageSize);
    return { page, pageSize, offset: (page - 1) * pageSize };
}

function addUpdate(assignments: string[], values: unknown[], column: string, value: unknown, cast = "") {
    if (value === undefined) return;
    values.push(value);
    assignments.push(`${column} = $${values.length}${cast}`);
}

function assertMoney(value: number, positive: boolean) {
    if (!Number.isFinite(value) || (positive ? value <= 0 : value === 0)) throw new Error(positive ? "算力点数必须大于 0" : "算力点数无效");
}

function assertBalance(value: number) {
    if (!Number.isFinite(value) || value < 0) throw new Error("算力余额无效");
}

function notFound(message: string): never {
    throw new Error(message);
}

function mapPool(row: Record<string, unknown>): SchoolComputePoolRecord {
    return {
        schoolId: stringValue(row.school_id),
        availablePoints: numberValue(row.available_points),
        status: row.status === "frozen" || row.status === "closed" ? row.status : "active",
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}
function mapGroup(row: Record<string, unknown>): ProductionGroupRecord {
    const statuses = ["draft", "active", "frozen", "settling", "settled", "archived"] as const;
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        name: stringValue(row.name),
        description: stringValue(row.description),
        leaderMembershipId: stringValue(row.leader_membership_id),
        status: statuses.includes(row.status as (typeof statuses)[number]) ? (row.status as (typeof statuses)[number]) : "draft",
        schoolPointsBalance: numberValue(row.school_points_balance),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}
function mapMember(row: Record<string, unknown>): ProductionGroupMemberRecord {
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        groupId: stringValue(row.group_id),
        membershipId: stringValue(row.membership_id),
        role: row.role === "leader" ? "leader" : "member",
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}
function mapProject(row: Record<string, unknown>): ProductionGroupProjectRecord {
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        groupId: stringValue(row.group_id),
        orderId: stringValue(row.order_id),
        projectType: row.project_type === "drama" ? "drama" : "canvas",
        projectId: stringValue(row.project_id),
        createdByMembershipId: stringValue(row.created_by_membership_id),
        settledAt: optionalIso(row.settled_at),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}
function mapAllocationRequest(row: Record<string, unknown>): ComputeAllocationRequestRecord {
    const statuses = ["pending", "approved", "rejected", "cancelled"] as const;
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        groupId: stringValue(row.group_id),
        orderId: stringValue(row.order_id),
        requestedByMembershipId: stringValue(row.requested_by_membership_id),
        amount: numberValue(row.amount),
        reason: stringValue(row.reason),
        status: statuses.includes(row.status as (typeof statuses)[number]) ? (row.status as (typeof statuses)[number]) : "pending",
        reviewNote: stringValue(row.review_note),
        reviewedByMembershipId: optionalString(row.reviewed_by_membership_id),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}
function mapAdvance(row: Record<string, unknown>): PersonalAdvanceRecord {
    const statuses = ["active", "partially_consumed", "pending_school_confirmation", "returned", "disputed"] as const;
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        groupId: stringValue(row.group_id),
        orderId: stringValue(row.order_id),
        membershipId: stringValue(row.membership_id),
        userId: stringValue(row.user_id),
        originalPoints: numberValue(row.original_points),
        consumedPoints: numberValue(row.consumed_points),
        remainingPoints: numberValue(row.remaining_points),
        returnedPoints: numberValue(row.returned_points),
        status: statuses.includes(row.status as (typeof statuses)[number]) ? (row.status as (typeof statuses)[number]) : "active",
        pointRecordId: stringValue(row.point_record_id),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}
function mapConsumption(row: Record<string, unknown>): ComputeConsumptionRecord {
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        groupId: stringValue(row.group_id),
        orderId: stringValue(row.order_id),
        generationTaskId: stringValue(row.generation_task_id),
        userId: stringValue(row.user_id),
        sourceType: row.source_type === "group_personal_advance" ? "group_personal_advance" : "group_school_points",
        sourceId: stringValue(row.source_id),
        amount: numberValue(row.amount),
        status: row.status === "refunded" || row.status === "settled" ? row.status : "charged",
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}
function mapSettlement(row: Record<string, unknown>): ComputeSettlementRecord {
    const statuses = ["open", "pending_school_confirmation", "completed", "disputed"] as const;
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        groupId: stringValue(row.group_id),
        orderId: stringValue(row.order_id),
        status: statuses.includes(row.status as (typeof statuses)[number]) ? (row.status as (typeof statuses)[number]) : "open",
        unusedPersonalPointsReturned: numberValue(row.unused_personal_points_returned),
        consumedPersonalPointsPending: numberValue(row.consumed_personal_points_pending),
        confirmedPersonalPointsReturned: numberValue(row.confirmed_personal_points_returned),
        createdAt: isoValue(row.created_at),
        updatedAt: isoValue(row.updated_at),
    };
}
function mapLedger(row: Record<string, unknown>): SchoolComputeLedgerRecord {
    return {
        id: stringValue(row.id),
        schoolId: stringValue(row.school_id),
        groupId: optionalString(row.group_id),
        orderId: optionalString(row.order_id),
        type: stringValue(row.type),
        amount: numberValue(row.amount),
        balanceAfter: numberValue(row.balance_after),
        idempotencyKey: stringValue(row.idempotency_key),
        actorUserId: optionalString(row.actor_user_id),
        sourceEntryId: optionalString(row.source_entry_id),
        createdAt: isoValue(row.created_at),
    };
}
