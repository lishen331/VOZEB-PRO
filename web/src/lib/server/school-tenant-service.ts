import { randomUUID } from "node:crypto";

import { getPublicUsersByIds } from "@/lib/auth/store";
import type { PublicUser } from "@/lib/auth/store";
import { hasAdminPermission } from "@/lib/admin-permissions";
import type { CreateSchoolInput, PageResult, SchoolClass, SchoolClassDetail, SchoolClassInput, SchoolDetail, SchoolMember, SchoolMemberPatch, SchoolSummary, UpdateSchoolInput } from "@/lib/school-domain";
import { createSchoolDomainRepository, type SchoolDomainRepository, type SchoolMembershipRecord } from "@/lib/server/school-domain-repository";
import { SchoolServiceError, requireSchoolManager } from "./school-access-service";
import { createSchoolWithAdministrator } from "./school-member-provisioning-service";

export async function listSchoolsByAdmin(actorId: string, input: { page?: number; pageSize?: number; keyword?: string; status?: "active" | "disabled" }): Promise<PageResult<SchoolSummary>> {
    await requireEducationAdmin(actorId);
    const result = await createSchoolDomainRepository().listSchools(input);
    return { ...result, items: result.items.map(toSchoolDetail) };
}

export async function getSchoolByAdmin(actorId: string, schoolId: string): Promise<SchoolDetail> {
    await requireEducationAdmin(actorId);
    const school = await createSchoolDomainRepository().getSchool(schoolId);
    if (!school) throw new SchoolServiceError(404, "学校不存在");
    return toSchoolDetail(school);
}

export async function createSchoolByAdmin(actorId: string, input: CreateSchoolInput): Promise<SchoolDetail> {
    await requireEducationAdmin(actorId);
    const name = requiredText(input.name, "学校名称", 120);
    return createSchoolWithAdministrator({ id: randomUUID(), name, profile: input.profile || {}, administrator: input.administrator });
}

export async function updateSchoolByAdmin(actorId: string, schoolId: string, input: UpdateSchoolInput): Promise<SchoolDetail> {
    await requireEducationAdmin(actorId);
    return updateSchool(schoolId, input);
}

export async function updateSchoolProfile(managerId: string, input: Pick<UpdateSchoolInput, "name" | "profile">): Promise<SchoolDetail> {
    const context = await requireSchoolManager(managerId);
    return updateSchool(context.school.id, input);
}

export async function listSchoolMembers(managerId: string, input: { page?: number; pageSize?: number; keyword?: string; role?: "teacher" | "student"; status?: "active" | "disabled" }): Promise<PageResult<SchoolMember>> {
    const context = await requireSchoolManager(managerId);
    const result = await createSchoolDomainRepository().listMembers(context.school.id, input);
    return mapMemberPage(result);
}

export async function updateSchoolMember(managerId: string, membershipId: string, patch: SchoolMemberPatch): Promise<SchoolMember> {
    const context = await requireSchoolManager(managerId);
    const repository = createSchoolDomainRepository();
    const updated = await repository.transact(async (transaction) => {
        const membership = await transaction.getMembership(context.school.id, membershipId, true);
        if (!membership) throw new SchoolServiceError(404, "学校成员不存在");
        const nextRole = patch.role || membership.role;
        const nextStatus = patch.status || membership.status;
        const nextPermissions = patch.permissions === undefined ? membership.permissions : patch.permissions;
        if (nextPermissions.includes("school.manage") && (nextRole !== "teacher" || nextStatus !== "active")) throw new SchoolServiceError(400, "只有可用老师可以担任学校管理员");
        if (membership.permissions.includes("school.manage") && (!nextPermissions.includes("school.manage") || nextRole !== "teacher" || nextStatus !== "active")) {
            if ((await countActiveManagers(transaction, context.school.id)) <= 1) throw new SchoolServiceError(409, "学校必须保留至少一位可用管理员");
        }
        const record = await transaction.updateMembership(context.school.id, membershipId, { ...patch, updatedAt: new Date().toISOString() });
        if (!record) throw new SchoolServiceError(404, "学校成员不存在");
        return record;
    });
    return toSchoolMember(updated, await publicUser(updated.userId));
}

export async function removeSchoolMember(managerId: string, membershipId: string) {
    const context = await requireSchoolManager(managerId);
    const repository = createSchoolDomainRepository();
    return repository.transact(async (transaction) => {
        const membership = await transaction.getMembership(context.school.id, membershipId, true);
        if (!membership) throw new SchoolServiceError(404, "学校成员不存在");
        if (membership.permissions.includes("school.manage") && (await countActiveManagers(transaction, context.school.id)) <= 1) throw new SchoolServiceError(409, "学校必须保留至少一位可用管理员");
        try {
            return await transaction.deleteMembership(context.school.id, membershipId);
        } catch {
            throw new SchoolServiceError(409, "该成员仍被班级、课程或教学记录引用，请先解除关联");
        }
    });
}

export async function createSchoolClass(managerId: string, input: SchoolClassInput): Promise<SchoolClass> {
    const context = await requireSchoolManager(managerId);
    const now = new Date().toISOString();
    return createSchoolDomainRepository().insertClass({
        id: randomUUID(),
        schoolId: context.school.id,
        name: requiredText(input.name, "班级名称", 120),
        description: optionalText(input.description, 500),
        status: "active",
        createdAt: now,
        updatedAt: now,
    });
}

export async function replaceSchoolClassMembers(managerId: string, classId: string, input: { teacherMembershipIds: string[]; studentMembershipIds: string[] }): Promise<SchoolClassDetail> {
    const context = await requireSchoolManager(managerId);
    const repository = createSchoolDomainRepository();
    const result = await repository.transact(async (transaction) => {
        const schoolClass = await transaction.getClass(context.school.id, classId, true);
        if (!schoolClass) throw new SchoolServiceError(404, "班级不存在");
        const teacherIds = uniqueIds(input.teacherMembershipIds);
        const studentIds = uniqueIds(input.studentMembershipIds);
        if (teacherIds.some((id) => studentIds.includes(id))) throw new SchoolServiceError(400, "同一成员不能同时作为老师和学生加入班级");
        const members: SchoolMembershipRecord[] = [];
        for (const [role, ids] of [
            ["teacher", teacherIds],
            ["student", studentIds],
        ] as const) {
            for (const id of ids) {
                const membership = await transaction.getMembership(context.school.id, id);
                if (!membership) throw new SchoolServiceError(404, "学校成员不存在");
                if (membership.role !== role || membership.status !== "active") throw new SchoolServiceError(400, `班级${role === "teacher" ? "老师" : "学生"}身份无效`);
                members.push(membership);
            }
        }
        await transaction.replaceClassMembers(
            context.school.id,
            classId,
            members.map((member) => member.id),
        );
        return { schoolClass, members };
    });
    const users = await getPublicUsersByIds(result.members.map((member) => member.userId));
    const usersById = new Map(users.map((user) => [user.id, user]));
    const members = result.members.map((member) => toSchoolMember(member, usersById.get(member.userId)));
    return { ...result.schoolClass, teachers: members.filter((member) => member.role === "teacher"), students: members.filter((member) => member.role === "student") };
}

async function updateSchool(schoolId: string, input: UpdateSchoolInput) {
    const patch = {
        ...(input.name === undefined ? {} : { name: requiredText(input.name, "学校名称", 120) }),
        ...(input.profile === undefined ? {} : { profile: input.profile as import("@/lib/server/database/repository-types").JsonValue }),
        ...(input.status === undefined ? {} : { status: input.status }),
        updatedAt: new Date().toISOString(),
    };
    const school = await createSchoolDomainRepository().updateSchool(schoolId, patch);
    if (!school) throw new SchoolServiceError(404, "学校不存在");
    return toSchoolDetail(school);
}

async function requireEducationAdmin(actorId: string) {
    const actor = (await getPublicUsersByIds([actorId]))[0];
    if (!hasAdminPermission(actor, "education.manage")) throw new SchoolServiceError(403, "当前管理员没有产教运营职责权限");
    return actor;
}

async function countActiveManagers(repository: SchoolDomainRepository, schoolId: string) {
    let page = 1;
    let count = 0;
    while (true) {
        const result = await repository.listMembers(schoolId, { page, pageSize: 100, role: "teacher", status: "active" });
        count += result.items.filter((member) => member.permissions.includes("school.manage")).length;
        if (page * result.pageSize >= result.total) return count;
        page += 1;
    }
}

async function mapMemberPage(result: { items: SchoolMembershipRecord[]; total: number; page: number; pageSize: number }): Promise<PageResult<SchoolMember>> {
    const users = await getPublicUsersByIds(result.items.map((member) => member.userId));
    const usersById = new Map(users.map((user) => [user.id, user]));
    return { ...result, items: result.items.map((member) => toSchoolMember(member, usersById.get(member.userId))) };
}

async function publicUser(userId: string) {
    return (await getPublicUsersByIds([userId]))[0];
}

function toSchoolMember(member: SchoolMembershipRecord, user: PublicUser | undefined): SchoolMember {
    if (!user) throw new SchoolServiceError(409, "学校成员账号不存在");
    return {
        id: member.id,
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
    };
}

function toSchoolDetail(school: { id: string; name: string; profile: unknown; status: "active" | "disabled"; createdAt: string; updatedAt: string }): SchoolDetail {
    return { ...school, profile: school.profile && typeof school.profile === "object" && !Array.isArray(school.profile) ? (school.profile as Record<string, unknown>) : {} };
}

function requiredText(value: unknown, label: string, maxLength: number) {
    const text = typeof value === "string" ? value.trim() : "";
    if (!text) throw new SchoolServiceError(400, `请填写${label}`);
    if (text.length > maxLength) throw new SchoolServiceError(400, `${label}不能超过 ${maxLength} 个字符`);
    return text;
}

function optionalText(value: unknown, maxLength: number) {
    const text = typeof value === "string" ? value.trim() : "";
    if (text.length > maxLength) throw new SchoolServiceError(400, `内容不能超过 ${maxLength} 个字符`);
    return text;
}

function uniqueIds(values: string[]) {
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
