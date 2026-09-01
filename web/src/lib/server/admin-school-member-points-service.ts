import { createHash } from "node:crypto";

import { getPublicUsersByIds } from "@/lib/auth/store";
import { AUTH_DATA_FILE } from "@/lib/auth/store-foundation";
import { emptyDb, MAX_POINT_AMOUNT, normalizeDb } from "@/lib/auth/store-normalizers";
import { publicUserFromAuthenticatedRecord, toPublicUser } from "@/lib/auth/store-user-projection";
import type { AdminSchoolMemberPoints, AdminSchoolMemberPointsAdjustmentInput, AdminSchoolMemberPointsAdjustmentResult, AdminSchoolMemberQuery, PageResult } from "@/lib/school-domain";
import { adjustPermanentPointsInAuthDb, adjustPermanentPointsInPostgresTransaction } from "@/lib/server/points-wallet-service";
import { createPostgresRepositories, ensurePostgresSchema, isPostgresDatabaseEnabled, withPostgresTransaction } from "@/lib/server/database";
import { readJsonDataFile, withJsonDataFileLocks, writeJsonDataFile } from "@/lib/server/data-adapter";
import { writeAuthDb } from "@/lib/auth/store-repository";
import { createSchoolDomainRepository, type SchoolMembershipRecord } from "@/lib/server/school-domain-repository";
import { mutateFileSchoolDomainInsideLock, SCHOOL_DOMAIN_DATA_FILE } from "@/lib/server/school-domain-file-repository";
import { SchoolServiceError, requirePlatformAdmin } from "@/lib/server/school-access-service";

export async function listSchoolMembersByAdmin(actorId: string, schoolId: string, query: AdminSchoolMemberQuery = {}): Promise<PageResult<AdminSchoolMemberPoints>> {
    await requirePlatformAdmin(actorId);
    const repository = createSchoolDomainRepository();
    if (!(await repository.getSchool(schoolId))) throw new SchoolServiceError(404, "学校不存在");
    const page = await repository.listMembers(schoolId, query);
    const users = await getPublicUsersByIds(page.items.map((item) => item.userId));
    const usersById = new Map(users.map((user) => [user.id, user]));
    return { ...page, items: page.items.map((member) => adminMember(member, usersById.get(member.userId))) };
}

type AdminSchoolMemberPointsAdjustmentServiceResult = AdminSchoolMemberPointsAdjustmentResult & { schoolName: string };

export async function adjustSchoolMemberPointsByAdmin(actorId: string, schoolId: string, membershipId: string, input: AdminSchoolMemberPointsAdjustmentInput): Promise<AdminSchoolMemberPointsAdjustmentServiceResult> {
    await requirePlatformAdmin(actorId);
    const normalized = normalizeAdjustment(input);
    const amount = normalized.operation === "credit" ? normalized.amount : -normalized.amount;
    const result = isPostgresDatabaseEnabled() ? await adjustPostgres(actorId, schoolId, membershipId, amount, normalized) : await adjustFile(actorId, schoolId, membershipId, amount, normalized);
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

async function adjustPostgres(actorId: string, schoolId: string, membershipId: string, amount: number, input: NormalizedAdjustment) {
    await ensurePostgresSchema();
    return withPostgresTransaction(async (client) => {
        const repository = createSchoolDomainRepository(client);
        const authRepositories = createPostgresRepositories(client);
        const school = await repository.getSchool(schoolId, true);
        if (!school) throw new SchoolServiceError(404, "学校不存在");
        const membership = await repository.getMembership(schoolId, membershipId, true);
        if (!membership) throw new SchoolServiceError(404, "学校成员不存在");
        const user = await authRepositories.users.getById(membership.userId, true);
        if (!user) throw new SchoolServiceError(404, "学校成员不存在");
        const requestFingerprint = fingerprint({ actorId, schoolId, membershipId, userId: membership.userId, operation: input.operation, amount: input.amount, reason: input.reason });
        const wallet = await adjustPermanentPointsInPostgresTransaction(client, {
            userId: membership.userId,
            amount,
            description: input.reason,
            idempotencyKey: input.idempotencyKey,
            type: "admin-adjust",
            minimumBalance: 0,
            requireActive: false,
            requestFingerprint,
        });
        if (!wallet) throw new SchoolServiceError(409, "个人永久积分调整未生效");
        const now = new Date().toISOString();
        const details = await authRepositories.users.getPublicDetails([membership.userId], { now, date: wallet.snapshot.dailyDate });
        const publicUser = details[0] ? publicUserFromAuthenticatedRecord(details[0], wallet.snapshot.dailyExpiresAt) : undefined;
        if (!publicUser) throw new SchoolServiceError(404, "学校成员不存在");
        return { wallet, member: adminMember(membership, publicUser), schoolName: school.name };
    });
}

async function adjustFile(actorId: string, schoolId: string, membershipId: string, amount: number, input: NormalizedAdjustment) {
    return withJsonDataFileLocks([AUTH_DATA_FILE, SCHOOL_DOMAIN_DATA_FILE], async () => {
        const [authBefore, schoolBefore] = await Promise.all([readJsonDataFile(AUTH_DATA_FILE, emptyDb()), readJsonDataFile(SCHOOL_DOMAIN_DATA_FILE, {})]);
        const authDb = normalizeDb(authBefore);
        try {
            const result = await mutateFileSchoolDomainInsideLock(
                async (repository) => {
                    const school = await repository.getSchool(schoolId);
                    if (!school) throw new SchoolServiceError(404, "学校不存在");
                    const membership = await repository.getMembership(schoolId, membershipId);
                    if (!membership) throw new SchoolServiceError(404, "学校成员不存在");
                    const requestFingerprint = fingerprint({ actorId, schoolId, membershipId, userId: membership.userId, operation: input.operation, amount: input.amount, reason: input.reason });
                    const wallet = adjustPermanentPointsInAuthDb(authDb, {
                        userId: membership.userId,
                        amount,
                        description: input.reason,
                        idempotencyKey: input.idempotencyKey,
                        requestFingerprint,
                        minimumBalance: 0,
                        requireActive: false,
                    });
                    if (!wallet) throw new SchoolServiceError(409, "个人永久积分调整未生效");
                    const user = authDb.users.find((item) => item.id === membership.userId);
                    if (!user) throw new SchoolServiceError(404, "学校成员不存在");
                    return { wallet, member: adminMember(membership, toPublicUser(user, authDb)), schoolName: school.name };
                },
                { lockAlreadyHeld: true },
            );
            await writeAuthDb(authDb);
            return result;
        } catch (error) {
            await Promise.all([writeJsonDataFile(AUTH_DATA_FILE, authBefore), writeJsonDataFile(SCHOOL_DOMAIN_DATA_FILE, schoolBefore)]);
            throw error;
        }
    });
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
