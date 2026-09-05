import { randomUUID } from "node:crypto";

import { getPublicUsersByIds } from "@/lib/auth/store";
import type { PublicUser } from "@/lib/auth/store";
import { hasAdminPermission } from "@/lib/admin-permissions";
import type { CreateSchoolInput, PageResult, SchoolAdministratorSummary, SchoolClass, SchoolClassDetail, SchoolClassInput, SchoolDetail, SchoolMember, SchoolMemberPatch, SchoolStatus, SchoolSummary, UpdateSchoolInput } from "@/lib/school-domain";
import { SchoolDomainReferenceConflictError } from "@/lib/server/school-domain-errors";
import { createSchoolDomainRepository, type SchoolDomainRepository, type SchoolMembershipRecord } from "@/lib/server/school-domain-repository";
import { SchoolServiceError, requirePlatformAdmin, requireSchoolManager } from "./school-access-service";
import { createSchoolWithAdministrator } from "./school-member-provisioning-service";

export async function listSchoolsByAdmin(actorId: string, input: { page?: number; pageSize?: number; keyword?: string; status?: "active" | "disabled" }): Promise<PageResult<SchoolSummary>> {
    await requirePlatformAdmin(actorId);
    const repository = createSchoolDomainRepository();
    const result = await repository.listSchools(input);
    const managers = await repository.listFirstManagers(result.items.map((school) => school.id));
    const users = managers.length ? await getPublicUsersByIds(managers.map((manager) => manager.userId)) : [];
    const usersById = new Map(users.map((user) => [user.id, user]));
    const managersBySchool = new Map(managers.map((manager) => [manager.schoolId, administratorSummary(usersById.get(manager.userId))]));
    return { ...result, items: result.items.map((school) => ({ ...toSchoolDetail(school), administrator: managersBySchool.get(school.id) })) };
}

export async function getSchoolByAdmin(actorId: string, schoolId: string): Promise<SchoolDetail> {
    await requireEducationAdmin(actorId);
    const school = await createSchoolDomainRepository().getSchool(schoolId);
    if (!school) throw new SchoolServiceError(404, "学校不存在");
    return toSchoolDetail(school);
}

export async function createSchoolByAdmin(actorId: string, input: CreateSchoolInput): Promise<SchoolDetail> {
    await requireEducationAdmin(actorId);
    const source = inputRecord(input);
    const name = requiredText(source.name, "学校名称", 120);
    const profile = source.profile === undefined ? {} : jsonRecord(source.profile, "学校资料");
    const administrator = inputRecord(source.administrator, "请填写首位学校管理员账号") as CreateSchoolInput["administrator"];
    return createSchoolWithAdministrator({ id: randomUUID(), name, profile, administrator });
}

export async function updateSchoolByAdmin(actorId: string, schoolId: string, input: UpdateSchoolInput): Promise<SchoolDetail> {
    await requireEducationAdmin(actorId);
    return updateSchool(schoolId, input);
}

export async function updateSchoolProfile(managerId: string, input: Pick<UpdateSchoolInput, "name" | "profile">): Promise<SchoolDetail> {
    const context = await requireSchoolManager(managerId);
    const source = inputRecord(input);
    if (source.status !== undefined) throw new SchoolServiceError(400, "学校状态只能由平台管理员修改");
    return updateSchool(context.school.id, {
        ...(source.name === undefined ? {} : { name: source.name as string }),
        ...(source.profile === undefined ? {} : { profile: source.profile as Record<string, unknown> }),
    });
}

export async function getSchoolProfile(managerId: string): Promise<SchoolDetail> {
    const context = await requireSchoolManager(managerId);
    const school = await createSchoolDomainRepository().getSchool(context.school.id);
    if (!school) throw new SchoolServiceError(404, "学校不存在");
    return toSchoolDetail(school);
}

export async function listSchoolMembers(managerId: string, input: { page?: number; pageSize?: number; keyword?: string; role?: "teacher" | "student"; status?: "active" | "disabled" }): Promise<PageResult<SchoolMember>> {
    const context = await requireSchoolManager(managerId);
    const result = await createSchoolDomainRepository().listMembers(context.school.id, input);
    return mapMemberPage(result);
}

export async function updateSchoolMember(managerId: string, membershipId: string, patch: SchoolMemberPatch): Promise<SchoolMember> {
    const context = await requireSchoolManager(managerId);
    const normalizedPatch = memberPatch(patch);
    const repository = createSchoolDomainRepository();
    const updated = await repository.transact(async (transaction) => {
        if (!(await transaction.getSchool(context.school.id, true))) throw new SchoolServiceError(404, "学校不存在");
        const membership = await transaction.getMembership(context.school.id, membershipId, true);
        if (!membership) throw new SchoolServiceError(404, "学校成员不存在");
        const nextRole = normalizedPatch.role || membership.role;
        const nextStatus = normalizedPatch.status || membership.status;
        const nextPermissions = normalizedPatch.permissions === undefined ? membership.permissions : normalizedPatch.permissions;
        if (nextPermissions.includes("school.manage") && (nextRole !== "teacher" || nextStatus !== "active")) throw new SchoolServiceError(400, "只有可用老师可以担任学校管理员");
        if (membership.permissions.includes("school.manage") && (!nextPermissions.includes("school.manage") || nextRole !== "teacher" || nextStatus !== "active")) {
            if ((await countActiveManagers(transaction, context.school.id)) <= 1) throw new SchoolServiceError(409, "学校必须保留至少一位可用管理员");
        }
        const record = await transaction.updateMembership(context.school.id, membershipId, { ...normalizedPatch, updatedAt: new Date().toISOString() });
        if (!record) throw new SchoolServiceError(404, "学校成员不存在");
        return record;
    });
    return toSchoolMember(updated, await publicUser(updated.userId));
}

export async function removeSchoolMember(managerId: string, membershipId: string) {
    const context = await requireSchoolManager(managerId);
    const repository = createSchoolDomainRepository();
    return repository.transact(async (transaction) => {
        if (!(await transaction.getSchool(context.school.id, true))) throw new SchoolServiceError(404, "学校不存在");
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
    const source = inputRecord(input);
    const now = new Date().toISOString();
    return createSchoolDomainRepository().insertClass({
        id: randomUUID(),
        schoolId: context.school.id,
        name: requiredText(source.name, "班级名称", 120),
        description: optionalText(source.description, "班级说明", 500),
        status: "active",
        createdAt: now,
        updatedAt: now,
    });
}

export async function listSchoolClasses(managerId: string, input: { page?: number; pageSize?: number; keyword?: string; status?: SchoolStatus }): Promise<PageResult<SchoolClass>> {
    const context = await requireSchoolManager(managerId);
    return createSchoolDomainRepository().listClasses(context.school.id, input);
}

export async function getSchoolClass(managerId: string, classId: string): Promise<SchoolClassDetail> {
    const context = await requireSchoolManager(managerId);
    const repository = createSchoolDomainRepository();
    const schoolClass = await repository.getClass(context.school.id, classId);
    if (!schoolClass) throw new SchoolServiceError(404, "班级不存在");
    const members = await listAllClassMembers(repository, context.school.id, classId);
    return classDetail(schoolClass, members);
}

export async function updateSchoolClass(managerId: string, classId: string, input: Partial<SchoolClassInput> & { status?: "active" | "disabled" }): Promise<SchoolClass> {
    const context = await requireSchoolManager(managerId);
    const patch = classPatch(input);
    const schoolClass = await createSchoolDomainRepository().updateClass(context.school.id, classId, {
        ...patch,
        updatedAt: new Date().toISOString(),
    });
    if (!schoolClass) throw new SchoolServiceError(404, "班级不存在");
    return schoolClass;
}

export async function removeSchoolClass(managerId: string, classId: string) {
    const context = await requireSchoolManager(managerId);
    try {
        if (!(await createSchoolDomainRepository().deleteClass(context.school.id, classId))) throw new SchoolServiceError(404, "班级不存在");
    } catch (error) {
        if (error instanceof SchoolServiceError) throw error;
        if (error instanceof SchoolDomainReferenceConflictError || (error && typeof error === "object" && (error as { code?: unknown }).code === "23503")) {
            throw new SchoolServiceError(409, "班级仍被课程或商单引用，不能删除");
        }
        throw error;
    }
    return { id: classId };
}

export async function replaceSchoolClassMembers(managerId: string, classId: string, input: { teacherMembershipIds: string[]; studentMembershipIds: string[] }): Promise<SchoolClassDetail> {
    return mutateSchoolClassMembers(managerId, classId, input);
}

export async function updateSchoolClassWithMembers(
    managerId: string,
    classId: string,
    patch: Partial<SchoolClassInput> & { status?: "active" | "disabled" },
    input: { teacherMembershipIds: string[]; studentMembershipIds: string[] },
): Promise<SchoolClassDetail> {
    return mutateSchoolClassMembers(managerId, classId, input, patch);
}

async function mutateSchoolClassMembers(managerId: string, classId: string, input: { teacherMembershipIds: string[]; studentMembershipIds: string[] }, patch?: Partial<SchoolClassInput> & { status?: "active" | "disabled" }): Promise<SchoolClassDetail> {
    const context = await requireSchoolManager(managerId);
    const source = inputRecord(input);
    const teacherIds = uniqueIds(source.teacherMembershipIds, "班级老师");
    const studentIds = uniqueIds(source.studentMembershipIds, "班级学生");
    const normalizedPatch = patch === undefined ? undefined : classPatch(patch);
    const repository = createSchoolDomainRepository();
    const result = await repository.transact(async (transaction) => {
        const existingClass = await transaction.getClass(context.school.id, classId, true);
        if (!existingClass) throw new SchoolServiceError(404, "班级不存在");
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
        const schoolClass = normalizedPatch
            ? await transaction.updateClass(context.school.id, classId, {
                  ...normalizedPatch,
                  updatedAt: new Date().toISOString(),
              })
            : existingClass;
        if (!schoolClass) throw new SchoolServiceError(404, "班级不存在");
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
    const source = inputRecord(input);
    const status: "active" | "disabled" | undefined = source.status === "active" || source.status === "disabled" ? source.status : undefined;
    if (source.status !== undefined && status === undefined) throw new SchoolServiceError(400, "学校状态无效");
    const patch = {
        ...(source.name === undefined ? {} : { name: requiredText(source.name, "学校名称", 120) }),
        ...(source.profile === undefined ? {} : { profile: jsonRecord(source.profile, "学校资料") as import("@/lib/server/database/repository-types").JsonValue }),
        ...(status === undefined ? {} : { status }),
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

function administratorSummary(user: PublicUser | undefined): SchoolAdministratorSummary | undefined {
    return user ? { accountId: user.accountId, username: user.username, displayName: user.displayName, email: user.email } : undefined;
}

async function mapMemberPage(result: { items: SchoolMembershipRecord[]; total: number; page: number; pageSize: number }): Promise<PageResult<SchoolMember>> {
    const users = await getPublicUsersByIds(result.items.map((member) => member.userId));
    const usersById = new Map(users.map((user) => [user.id, user]));
    return { ...result, items: result.items.map((member) => toSchoolMember(member, usersById.get(member.userId))) };
}

async function listAllClassMembers(repository: SchoolDomainRepository, schoolId: string, classId: string) {
    const records: SchoolMembershipRecord[] = [];
    let page = 1;
    while (true) {
        const result = await repository.listClassMembers(schoolId, classId, { page, pageSize: 100 });
        records.push(...result.items);
        if (page * result.pageSize >= result.total) break;
        page += 1;
    }
    const users = await getPublicUsersByIds(records.map((member) => member.userId));
    const usersById = new Map(users.map((user) => [user.id, user]));
    return records.map((member) => toSchoolMember(member, usersById.get(member.userId)));
}

function classDetail(schoolClass: SchoolClass, members: SchoolMember[]): SchoolClassDetail {
    return { ...schoolClass, teachers: members.filter((member) => member.role === "teacher"), students: members.filter((member) => member.role === "student") };
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

function optionalText(value: unknown, label: string, maxLength: number) {
    if (value !== undefined && typeof value !== "string") throw new SchoolServiceError(400, `${label}无效`);
    const text = typeof value === "string" ? value.trim() : "";
    if (text.length > maxLength) throw new SchoolServiceError(400, `内容不能超过 ${maxLength} 个字符`);
    return text;
}

function inputRecord(value: unknown, message = "请求参数无效"): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new SchoolServiceError(400, message);
    return value as Record<string, unknown>;
}

function jsonRecord(value: unknown, label: string) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new SchoolServiceError(400, `${label}无效`);
    return value as Record<string, unknown>;
}

function memberPatch(value: unknown): SchoolMemberPatch {
    const source = inputRecord(value);
    if (source.role !== undefined && source.role !== "teacher" && source.role !== "student") throw new SchoolServiceError(400, "学校成员身份无效");
    if (source.status !== undefined && source.status !== "active" && source.status !== "disabled") throw new SchoolServiceError(400, "学校成员状态无效");
    if (source.permissions !== undefined && (!Array.isArray(source.permissions) || source.permissions.some((permission) => permission !== "school.manage"))) throw new SchoolServiceError(400, "学校成员权限无效");
    return {
        ...(source.role === undefined ? {} : { role: source.role }),
        ...(source.status === undefined ? {} : { status: source.status }),
        ...(source.permissions === undefined ? {} : { permissions: source.permissions as SchoolMemberPatch["permissions"] }),
    };
}

function classPatch(value: unknown): Partial<SchoolClassInput> & { status?: "active" | "disabled" } {
    const source = inputRecord(value);
    if (source.status !== undefined && source.status !== "active" && source.status !== "disabled") throw new SchoolServiceError(400, "班级状态无效");
    return {
        ...(source.name === undefined ? {} : { name: requiredText(source.name, "班级名称", 120) }),
        ...(source.description === undefined ? {} : { description: optionalText(source.description, "班级说明", 500) }),
        ...(source.status === undefined ? {} : { status: source.status }),
    };
}

function uniqueIds(values: unknown, label: string) {
    if (!Array.isArray(values) || values.some((value) => typeof value !== "string")) throw new SchoolServiceError(400, `${label}列表无效`);
    return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
