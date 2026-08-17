import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requireSchoolManager: vi.fn(),
    getPublicUsersByIds: vi.fn(),
    createSchoolWithAdministrator: vi.fn(),
    getMembership: vi.fn(),
    updateMembership: vi.fn(),
    insertClass: vi.fn(),
    getClass: vi.fn(),
    updateClass: vi.fn(),
    replaceClassMembers: vi.fn(),
    listClassMembers: vi.fn(),
    listMembers: vi.fn(),
    transact: vi.fn(),
}));

vi.mock("./school-access-service", async (load) => {
    const actual = await load<typeof import("./school-access-service")>();
    return { ...actual, requireSchoolManager: mocks.requireSchoolManager };
});
vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("./school-member-provisioning-service", () => ({ createSchoolWithAdministrator: mocks.createSchoolWithAdministrator }));
vi.mock("@/lib/server/school-domain-repository", () => ({
    createSchoolDomainRepository: () => repository,
}));

import { createSchoolByAdmin, createSchoolClass, replaceSchoolClassMembers, updateSchoolMember } from "./school-tenant-service";

const now = "2026-08-17T00:00:00.000Z";
const repository = {
    getMembership: mocks.getMembership,
    updateMembership: mocks.updateMembership,
    insertClass: mocks.insertClass,
    getClass: mocks.getClass,
    updateClass: mocks.updateClass,
    replaceClassMembers: mocks.replaceClassMembers,
    listClassMembers: mocks.listClassMembers,
    listMembers: mocks.listMembers,
    transact: mocks.transact,
};

describe("school tenant service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireSchoolManager.mockResolvedValue(managerContext());
        mocks.transact.mockImplementation(async (operation) => operation(repository));
    });

    it("requires the platform education duty before creating a school", async () => {
        mocks.getPublicUsersByIds.mockResolvedValueOnce([{ id: "plain-admin", role: "admin", status: "active", adminPermissions: ["users.manage"] }]);
        await expect(createSchoolByAdmin("plain-admin", { name: "甲学校", administrator: { username: "teacher_a", displayName: "老师", password: "password123" } })).rejects.toMatchObject({ status: 403 });

        mocks.getPublicUsersByIds.mockResolvedValueOnce([{ id: "education-admin", role: "admin", status: "active", adminPermissions: ["education.manage"] }]);
        mocks.createSchoolWithAdministrator.mockImplementation(async (input) => ({ ...input, profile: input.profile, status: "active", createdAt: now, updatedAt: now }));
        await expect(createSchoolByAdmin("education-admin", { name: " 甲学校 ", administrator: { username: "teacher_a", displayName: "老师", password: "password123" } })).resolves.toMatchObject({
            name: "甲学校",
        });
    });

    it("returns 404 instead of exposing a membership from another school", async () => {
        mocks.getMembership.mockResolvedValue(null);

        await expect(updateSchoolMember("manager-a", "school-b-member", { status: "disabled" })).rejects.toMatchObject({ status: 404 });
        expect(mocks.updateMembership).not.toHaveBeenCalled();
    });

    it("only grants school management to active teachers and preserves the last manager", async () => {
        mocks.getMembership.mockResolvedValueOnce(member("student-a", "student", [])).mockResolvedValueOnce(member("manager-a", "teacher", ["school.manage"]));
        await expect(updateSchoolMember("manager-a", "student-a", { permissions: ["school.manage"] })).rejects.toMatchObject({ status: 400 });

        mocks.listMembers.mockResolvedValue({ items: [member("manager-a", "teacher", ["school.manage"])], total: 1, page: 1, pageSize: 100 });
        await expect(updateSchoolMember("manager-a", "manager-a", { permissions: [] })).rejects.toMatchObject({ status: 409 });
    });

    it("creates a class in the manager school and rejects cross-school member ids atomically", async () => {
        mocks.insertClass.mockImplementation(async (record) => record);
        await expect(createSchoolClass("manager-a", { name: "一班", description: "设计班" })).resolves.toMatchObject({ schoolId: "school-a", name: "一班" });

        mocks.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", name: "一班", description: "", status: "active", createdAt: now, updatedAt: now });
        mocks.getMembership.mockImplementation(async (_schoolId: string, membershipId: string) => (membershipId === "foreign" ? null : member(membershipId, membershipId.startsWith("teacher") ? "teacher" : "student", [])));
        await expect(replaceSchoolClassMembers("manager-a", "class-a", { teacherMembershipIds: ["teacher-a"], studentMembershipIds: ["foreign"] })).rejects.toMatchObject({ status: 404 });
        expect(mocks.replaceClassMembers).not.toHaveBeenCalled();
    });
});

function managerContext() {
    return { school: { id: "school-a", name: "甲学校", status: "active" }, membership: { id: "manager-a", role: "teacher", permissions: ["school.manage"], status: "active" }, canManageSchool: true };
}

function member(id: string, role: "teacher" | "student", permissions: Array<"school.manage">) {
    return { id, schoolId: "school-a", userId: `${id}-user`, role, permissions, status: "active" as const, joinSource: "admin" as const, createdAt: now, updatedAt: now };
}
