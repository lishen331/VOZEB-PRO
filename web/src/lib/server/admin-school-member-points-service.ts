import { createHash } from "node:crypto";

import { getPublicUsersByIds } from "@/lib/auth/store";
import { AUTH_DATA_FILE } from "@/lib/auth/store-foundation";
import { emptyDb, MAX_POINT_AMOUNT, normalizeDb } from "@/lib/auth/store-normalizers";
import { publicUserFromAuthenticatedRecord, toPublicUser } from "@/lib/auth/store-user-projection";
import type { AdminSchoolMemberPoints, AdminSchoolMemberBatchPointsAdjustmentInput, AdminSchoolMemberPointsAdjustmentInput, AdminSchoolMemberPointsAdjustmentResult, AdminSchoolMemberQuery, PageResult } from "@/lib/school-domain";
import { adjustPermanentPointsInAuthDb, adjustPermanentPointsInPostgresTransaction } from "@/lib/server/points-wallet-service";
import { createPostgresRepositories, ensurePostgresSchema, isPostgresDatabaseEnabled, withPostgresTransaction } from "@/lib/server/database";
import { readJsonDataFile, withJsonDataFileLocks, writeJsonDataFile } from "@/lib/server/data-adapter";
import { writeAuthDb } from "@/lib/auth/store-repository";
import { createSchoolDomainRepository, type SchoolMembershipRecord } from "@/lib/server/school-domain-repository";
import { mutateFileSchoolDomainInsideLock, SCHOOL_DOMAIN_DATA_FILE } from "@/lib/server/school-domain-file-repository";
import { SchoolServiceError, requirePlatformAdmin } from "@/lib/server/school-access-service";

export async function listSchoolMembersByAdmin(actorId: string, schoolId: string, query: AdminSchoolMemberQuery = {}): Promise<PageResult<AdminSchoolMemberPoints>> {
    await requirePlatformAdmin(actorId, ["education.manage"]);
    const repository = createSchoolDomainRepository();
    if (!(await repository.getSchool(schoolId))) throw new SchoolServiceError(404, "学校不存在");
    const page = await repository.listMembers(schoolId, query);
    const users = await getPublicUsersByIds(page.items.map((item) => item.userId));
    const usersById = new Map(users.map((user) => [user.id, user]));
    return { ...page, items: page.items.map((member) => adminMember(member, usersById.get(member.userId))) };
}

type AdminSchoolMemberPointsAdjustmentServiceResult = AdminSchoolMemberPointsAdjustmentResult & { schoolName: string };

export async function adjustSchoolMemberPointsByAdmin(actorId: string, schoolId: string, membershipId: string, input: AdminSchoolMemberPointsAdjustmentInput): Promise<AdminSchoolMemberPointsAdjustmentServiceResult> {
    await requirePlatformAdmin(actorId, ["education.manage", "billing.manage"]);
    const normalized = normalizeAdjustment(input);
    const amount = normalized.operation === "credit" ? normalized.amount : -normalized.amount;
    const [result] = await adjustMembers(actorId, schoolId, [membershipId], amount, normalized);
    return result;
}

export async function adjustSchoolMemberBatchPointsByAdmin(actorId: string, schoolId: string, input: AdminSchoolMemberBatchPointsAdjustmentInput) {
    await requirePlatformAdmin(actorId, ["education.manage", "billing.manage"]);
    const normalized = normalizeAdjustment(input);
    if (!Array.isArray(input.membershipIds) || !input.membershipIds.length || input.membershipIds.some((id) => typeof id !== "string" || !id.trim())) {
        throw new SchoolServiceError(400, "请选择要调整积分的学校成员");
    }
    const membershipIds = [...new Set(input.membershipIds.map((id) => id.trim()))].sort();
    const amount = normalized.operation === "credit" ? normalized.amount : -normalized.amount;
    return adjustMembers(actorId, schoolId, membershipIds, amount, normalized, `school-member-batch:${fingerprint({ key: normalized.idempotencyKey })}`);
}

async function adjustMembers(actorId: string, schoolId: string, membershipIds: string[], amount: number, input: NormalizedAdjustment, batchKey?: string) {
    const targets = membershipIds.map((membershipId, index) => ({
        membershipId,
        idempotencyKey: batchKey ? (index === 0 ? batchKey : `${batchKey}:${index}`) : input.idempotencyKey,
    }));
    const requestFingerprint = (membership: SchoolMembershipRecord) =>
        fingerprint({
            actorId,
            schoolId,
            membershipId: membership.id,
            userId: membership.userId,
            operation: input.operation,
            amount: input.amount,
            reason: input.reason,
            ...(batchKey ? { membershipIds } : {}),
        });
    const adjustmentOptions = { amount, description: input.reason, minimumBalance: 0, requireActive: false };
    if (isPostgresDatabaseEnabled()) {
        await ensurePostgresSchema();
        return withPostgresTransaction(async (client) => {
            if (batchKey) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))", [batchKey]);
            const repository = createSchoolDomainRepository(client);
            const authRepositories = createPostgresRepositories(client);
            const school = await repository.getSchool(schoolId, true);
            if (!school) throw new SchoolServiceError(404, "学校不存在");
            const members = await getAdjustmentMembers(repository, schoolId, targets, true);
            const results = [];
            for (const { membership, idempotencyKey } of members) {
                const user = await authRepositories.users.getById(membership.userId, true);
                if (!user) throw new SchoolServiceError(404, "学校成员不存在");
                const wallet = await adjustPermanentPointsInPostgresTransaction(client, {
                    ...adjustmentOptions,
                    userId: membership.userId,
                    type: "admin-adjust",
                    idempotencyKey,
                    requestFingerprint: requestFingerprint(membership),
                });
                if (!wallet) throw new SchoolServiceError(409, "个人永久积分调整未生效");
                const details = await authRepositories.users.getPublicDetails([membership.userId], { now: new Date().toISOString(), date: wallet.snapshot.dailyDate });
                const publicUser = details[0] ? publicUserFromAuthenticatedRecord(details[0], wallet.snapshot.dailyExpiresAt) : undefined;
                results.push(adjustmentResult({ wallet, member: adminMember(membership, publicUser), schoolName: school.name }));
            }
            return results;
        });
    }
    return withJsonDataFileLocks([AUTH_DATA_FILE, SCHOOL_DOMAIN_DATA_FILE], async () => {
        const [authBefore, schoolBefore] = await Promise.all([readJsonDataFile(AUTH_DATA_FILE, emptyDb()), readJsonDataFile(SCHOOL_DOMAIN_DATA_FILE, {})]);
        const authDb = normalizeDb(authBefore);
        try {
            const results = await mutateFileSchoolDomainInsideLock(
                async (repository) => {
                    const school = await repository.getSchool(schoolId);
                    if (!school) throw new SchoolServiceError(404, "学校不存在");
                    const members = await getAdjustmentMembers(repository, schoolId, targets);
                    return members.map(({ membership, idempotencyKey }) => {
                        const wallet = adjustPermanentPointsInAuthDb(authDb, {
                            ...adjustmentOptions,
                            userId: membership.userId,
                            idempotencyKey,
                            requestFingerprint: requestFingerprint(membership),
                        });
                        if (!wallet) throw new SchoolServiceError(409, "个人永久积分调整未生效");
                        const user = authDb.users.find((item) => item.id === membership.userId);
                        if (!user) throw new SchoolServiceError(404, "学校成员不存在");
                        return adjustmentResult({ wallet, member: adminMember(membership, toPublicUser(user, authDb)), schoolName: school.name });
                    });
                },
                { lockAlreadyHeld: true },
            );
            await writeAuthDb(authDb);
            return results;
        } catch (error) {
            await Promise.all([writeJsonDataFile(AUTH_DATA_FILE, authBefore), writeJsonDataFile(SCHOOL_DOMAIN_DATA_FILE, schoolBefore)]);
            throw error;
        }
    });
}

async function getAdjustmentMembers(repository: ReturnType<typeof createSchoolDomainRepository>, schoolId: string, targets: { membershipId: string; idempotencyKey: string }[], lock?: true) {
    const members = [];
    for (const { membershipId, idempotencyKey } of targets) {
        const membership = await repository.getMembership(schoolId, membershipId, lock);
        if (!membership) throw new SchoolServiceError(404, "学校成员不存在");
        members.push({ membership, idempotencyKey });
    }
    return members.sort((left, right) => left.membership.userId.localeCompare(right.membership.userId));
}

function adjustmentResult(result: { member: AdminSchoolMemberPoints; schoolName: string; wallet: NonNullable<ReturnType<typeof adjustPermanentPointsInAuthDb>> }): AdminSchoolMemberPointsAdjustmentServiceResult {
    const balanceAfter = result.wallet.record.permanentBalanceAfter;
    return {
        member: result.member,
        adjustment: {
            recordId: result.wallet.record.id,
            operation: result.wallet.record.amount >= 0 ? "credit" : "debit",
            amount: Math.abs(result.wallet.record.amount),
            balanceBefore: balanceAfter - result.wallet.record.permanentAmount,
            balanceAfter,
            reason: result.wallet.record.description,
            createdAt: result.wallet.record.createdAt,
        },
        schoolName: result.schoolName,
    };
}

function adminMember(member: SchoolMembershipRecord, user: Awaited<ReturnType<typeof getPublicUsersByIds>>[number] | undefined): AdminSchoolMemberPoints {
    if (!user) throw new SchoolServiceError(404, "学校成员不存在");
    return {
        id: member.id,
        userId: user.id,
        accountId: user.accountId,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        role: member.role,
        permissions: member.permissions,
        status: member.status,
        joinSource: member.joinSource,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
        accountStatus: user.status,
        permanentPoints: user.permanentPointsBalance,
        dailyPoints: user.dailyPointsBalance,
        totalPoints: user.permanentPointsBalance + user.dailyPointsBalance,
        dailyPointsExpiresAt: user.dailyPointsExpiresAt,
    };
}

type NormalizedAdjustment = { operation: "credit" | "debit"; amount: number; reason: string; idempotencyKey: string };

function normalizeAdjustment(input: AdminSchoolMemberPointsAdjustmentInput): NormalizedAdjustment {
    if (input.operation !== "credit" && input.operation !== "debit") throw new SchoolServiceError(400, "积分操作类型无效");
    const amountText = String(input.amount).trim();
    const amount = Number(amountText);
    if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(amountText) || !Number.isFinite(amount) || amount <= 0) throw new SchoolServiceError(400, "积分数量必须为最多两位小数的正数");
    if (amount > MAX_POINT_AMOUNT) throw new SchoolServiceError(409, "个人永久积分调整超出上限");
    const reason = input.reason.trim();
    if (!reason) throw new SchoolServiceError(400, "请填写调账原因");
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) throw new SchoolServiceError(400, "缺少调账幂等编号");
    return { operation: input.operation, amount, reason, idempotencyKey };
}

function fingerprint(value: Record<string, unknown>) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
