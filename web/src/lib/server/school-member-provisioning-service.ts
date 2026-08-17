import { randomUUID } from "node:crypto";

import { createOrdinaryUsersForSchool, getPublicUsersByIds } from "@/lib/auth/store";
import { hashToken } from "@/lib/auth/store-normalizers";
import type { SchoolContext, SchoolDetail, SchoolMember, SchoolMemberCreateInput, SchoolMemberRole } from "@/lib/school-domain";
import { createSchoolDomainRepository, type SchoolRecord } from "@/lib/server/school-domain-repository";
import { SchoolServiceError, getSchoolContextForUser, requireSchoolManager } from "./school-access-service";

export async function createSchoolMembers(managerId: string, rows: SchoolMemberCreateInput[]): Promise<SchoolMember[]> {
    return provisionSchoolMembers(managerId, rows, "admin");
}

export async function importSchoolMembers(managerId: string, rows: SchoolMemberCreateInput[]): Promise<SchoolMember[]> {
    return provisionSchoolMembers(managerId, rows, "import");
}

async function provisionSchoolMembers(managerId: string, rows: SchoolMemberCreateInput[], joinSource: "admin" | "import") {
    const context = await requireSchoolManager(managerId);
    const normalized = normalizeRows(rows);
    return createOrdinaryUsersForSchool(context.school.id, normalized, { joinSource });
}

export async function createSchoolWithAdministrator(input: { id: string; name: string; profile: Record<string, unknown>; administrator: Omit<SchoolMemberCreateInput, "role"> }): Promise<SchoolDetail> {
    const now = new Date().toISOString();
    const school: SchoolRecord = { id: input.id, name: input.name, profile: input.profile as SchoolRecord["profile"], status: "active", createdAt: now, updatedAt: now };
    await createOrdinaryUsersForSchool(input.id, normalizeRows([{ ...input.administrator, role: "teacher" }]), { school, firstManager: true });
    return { ...school, profile: input.profile };
}

export async function rotateSchoolInviteCode(managerId: string, role: SchoolMemberRole): Promise<{ code: string }> {
    const context = await requireSchoolManager(managerId);
    if (role !== "teacher" && role !== "student") throw new SchoolServiceError(400, "邀请码身份无效");
    const code = inviteCode();
    const repository = createSchoolDomainRepository();
    const now = new Date().toISOString();
    const existing = await repository.getInviteCodeByRole(context.school.id, role);
    await repository.upsertInviteCode({
        id: existing?.id || randomUUID(),
        schoolId: context.school.id,
        role,
        codeDigest: hashToken(code),
        status: "active",
        createdAt: existing?.createdAt || now,
        updatedAt: now,
    });
    return { code };
}

export async function joinSchoolByInvite(userId: string, code: string): Promise<SchoolContext> {
    if (await getSchoolContextForUser(userId)) throw new SchoolServiceError(409, "当前账号已经加入学校");
    const normalizedCode = typeof code === "string" ? code.trim().toUpperCase() : "";
    if (!normalizedCode) throw new SchoolServiceError(400, "请填写邀请码");
    const repository = createSchoolDomainRepository();
    await repository.transact(async (transaction) => {
        if (await transaction.getMembershipByUserId(userId, true)) throw new SchoolServiceError(409, "当前账号已经加入学校");
        const invite = await transaction.getInviteCodeByDigest(hashToken(normalizedCode), true);
        if (!invite || invite.status !== "active" || (invite.expiresAt && Date.parse(invite.expiresAt) <= Date.now())) throw new SchoolServiceError(400, "邀请码无效或已过期");
        const school = await transaction.getSchool(invite.schoolId, true);
        if (!school || school.status !== "active") throw new SchoolServiceError(403, "学校当前不可加入");
        const now = new Date().toISOString();
        await transaction.insertMembership({
            id: randomUUID(),
            schoolId: invite.schoolId,
            userId,
            role: invite.role,
            permissions: [],
            status: "active",
            joinSource: "invite",
            createdAt: now,
            updatedAt: now,
        });
    });
    const context = await getSchoolContextForUser(userId);
    if (!context) throw new SchoolServiceError(500, "学校身份创建失败");
    return context;
}

function normalizeRows(rows: SchoolMemberCreateInput[]) {
    if (!Array.isArray(rows) || !rows.length) throw new SchoolServiceError(400, "请至少提供一位学校成员");
    const usernames = new Set<string>();
    const emails = new Set<string>();
    return rows.map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) throw new SchoolServiceError(400, "学校成员资料无效");
        const username = requiredText(row.username, "用户名", 64).toLowerCase();
        const email = typeof row.email === "string" ? row.email.trim().toLowerCase() : "";
        if (usernames.has(username) || (email && emails.has(email))) throw new SchoolServiceError(400, "批量成员中存在重复用户名或邮箱");
        usernames.add(username);
        if (email) emails.add(email);
        if (row.role !== "teacher" && row.role !== "student") throw new SchoolServiceError(400, "学校成员身份无效");
        return {
            username,
            email: email || undefined,
            displayName: requiredText(row.displayName || username, "显示名称", 80),
            password: requiredText(row.password, "初始密码", 200),
            role: row.role,
        };
    });
}

function requiredText(value: unknown, label: string, maxLength: number) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new SchoolServiceError(400, `请填写${label}`);
    if (text.length > maxLength) throw new SchoolServiceError(400, `${label}不能超过 ${maxLength} 个字符`);
    return text;
}

function inviteCode() {
    const value = randomUUID().replaceAll("-", "").slice(0, 20).toUpperCase();
    return `${value.slice(0, 5)}-${value.slice(5, 10)}-${value.slice(10, 15)}-${value.slice(15)}`;
}
