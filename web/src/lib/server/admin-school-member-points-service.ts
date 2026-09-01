import { createHash } from "node:crypto";

import { getPublicUsersByIds } from "@/lib/auth/store";
import type { AdminSchoolMemberPoints, AdminSchoolMemberPointsAdjustmentInput, AdminSchoolMemberPointsAdjustmentResult, AdminSchoolMemberQuery, PageResult } from "@/lib/school-domain";
import { adjustPermanentPointsInAuthDb, adjustPermanentPointsInPostgresTransaction, type PointsWalletMutationResult } from "@/lib/server/points-wallet-service";
import { createPostgresRepositories, ensurePostgresSchema, isPostgresDatabaseEnabled, withPostgresTransaction } from "@/lib/server/database";
import { mutateAuthDb } from "@/lib/auth/store-repository";
import { createSchoolDomainRepository, type SchoolMembershipRecord } from "@/lib/server/school-domain-repository";
import { mutateFileSchoolDomainInsideLock } from "@/lib/server/school-domain-file-repository";
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

export async function adjustSchoolMemberPointsByAdmin(actorId: string, schoolId: string, membershipId: string, input: AdminSchoolMemberPointsAdjustmentInput): Promise<AdminSchoolMemberPointsAdjustmentResult> {
    await requirePlatformAdmin(actorId);
    const normalized = normalizeAdjustment(input);
    const amount = normalized.operation === "credit" ? normalized.amount : -normalized.amount;
    const wallet = isPostgresDatabaseEnabled() ? await adjustPostgres(actorId, schoolId, membershipId, amount, normalized) : await adjustFile(actorId, schoolId, membershipId, amount, normalized);
    const member = await loadAdminMember(schoolId, membershipId);
    const balanceAfter = wallet.record.permanentBalanceAfter;
    return {
        member,
        adjustment: {
            recordId: wallet.record.id,
            operation: wallet.record.amount >= 0 ? "credit" : "debit",
            amount: Math.abs(wallet.record.amount),
            balanceBefore: balanceAfter - wallet.record.permanentAmount,
            balanceAfter,
            reason: wallet.record.description,
            createdAt: wallet.record.createdAt,
        },
    };
}

async function adjustPostgres(actorId: string, schoolId: string, membershipId: string, amount: number, input: NormalizedAdjustment) {
    await ensurePostgresSchema();
    return withPostgresTransaction(async (client) => {
        const repository = createSchoolDomainRepository(client);
        if (!(await repository.getSchool(schoolId, true))) throw new SchoolServiceError(404, "学校不存在");
        const membership = await repository.getMembership(schoolId, membershipId, true);
        if (!membership) throw new SchoolServiceError(404, "学校成员不存在");
        const user = await createPostgresRepositories(client).users.getById(membership.userId, true);
        if (!user) throw new SchoolServiceError(404, "学校成员不存在");
        const requestFingerprint = fingerprint({ actorId, schoolId, membershipId, userId: membership.userId, operation: input.operation, amount: input.amount, reason: input.reason });
        return adjustPermanentPointsInPostgresTransaction(client, {
            userId: membership.userId,
            amount,
            description: input.reason,
            idempotencyKey: input.idempotencyKey,
            type: "admin-adjust",
            minimumBalance: 0,
            requireActive: false,
            requestFingerprint,
        });
    }).then((result) => {
        if (!result) throw new SchoolServiceError(409, "个人永久积分调整未生效");
        return result;
    });
}

async function adjustFile(actorId: string, schoolId: string, membershipId: string, amount: number, input: NormalizedAdjustment) {
    return mutateFileSchoolDomainInsideLock(async (repository) => {
        const school = await repository.getSchool(schoolId);
        if (!school) throw new SchoolServiceError(404, "学校不存在");
        const membership = await repository.getMembership(schoolId, membershipId);
        if (!membership) throw new SchoolServiceError(404, "学校成员不存在");
        const requestFingerprint = fingerprint({ actorId, schoolId, membershipId, userId: membership.userId, operation: input.operation, amount: input.amount, reason: input.reason });
        let wallet: PointsWalletMutationResult | null | undefined;
        await mutateAuthDb(async (db) => {
            wallet = adjustPermanentPointsInAuthDb(db, {
                userId: membership.userId,
                amount,
                description: input.reason,
                idempotencyKey: input.idempotencyKey,
                requestFingerprint,
                minimumBalance: 0,
                requireActive: false,
            });
        });
        if (!wallet) throw new SchoolServiceError(409, "个人永久积分调整未生效");
        return wallet;
    });
}

async function loadAdminMember(schoolId: string, membershipId: string): Promise<AdminSchoolMemberPoints> {
    const membership = await createSchoolDomainRepository().getMembership(schoolId, membershipId);
    if (!membership) throw new SchoolServiceError(404, "学校成员不存在");
    const user = (await getPublicUsersByIds([membership.userId]))[0];
    return adminMember(membership, user);
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
    const reason = input.reason.trim();
    if (!reason) throw new SchoolServiceError(400, "请填写调账原因");
    const idempotencyKey = input.idempotencyKey.trim();
    if (!idempotencyKey) throw new SchoolServiceError(400, "缺少调账幂等编号");
    return { operation: input.operation, amount, reason, idempotencyKey };
}

function fingerprint(value: Record<string, unknown>) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
