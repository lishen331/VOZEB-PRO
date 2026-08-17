import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requireSchoolManager: vi.fn(),
    getPublicUsersByIds: vi.fn(),
    createSchoolWithAdministrator: vi.fn(),
    getSchool: vi.fn(),
    getMembership: vi.fn(),
    updateMembership: vi.fn(),
    deleteMembership: vi.fn(),
    updateSchool: vi.fn(),
    insertClass: vi.fn(),
    getClass: vi.fn(),
    updateClass: vi.fn(),
    deleteClass: vi.fn(),
    replaceClassMembers: vi.fn(),
    listClassMembers: vi.fn(),
    listSchools: vi.fn(),
    listFirstManagers: vi.fn(),
    listMembers: vi.fn(),
    listClasses: vi.fn(),
    transact: vi.fn(),
}));

vi.mock("./school-access-service", async (load) => {
    const actual = await load<typeof import("./school-access-service")>();
    return { ...actual, requireSchoolManager: mocks.requireSchoolManager };
});
vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("./school-member-provisioning-service", () => ({ createSchoolWithAdministrator: mocks.createSchoolWithAdministrator }));
vi.mock("@/lib/server/school-domain-repository", () => ({ createSchoolDomainRepository: () => repository }));

import {
    createSchoolByAdmin,
    createSchoolClass,
    listSchoolClasses,
    listSchoolsByAdmin,
    removeSchoolClass,
    removeSchoolMember,
    replaceSchoolClassMembers,
    updateSchoolByAdmin,
    updateSchoolClass,
    updateSchoolClassWithMembers,
    updateSchoolMember,
    updateSchoolProfile,
} from "./school-tenant-service";

const now = "2026-08-17T00:00:00.000Z";
const repository = {
    getSchool: mocks.getSchool,
    getMembership: mocks.getMembership,
    updateMembership: mocks.updateMembership,
    deleteMembership: mocks.deleteMembership,
    updateSchool: mocks.updateSchool,
    insertClass: mocks.insertClass,
    getClass: mocks.getClass,
    updateClass: mocks.updateClass,
    deleteClass: mocks.deleteClass,
    replaceClassMembers: mocks.replaceClassMembers,
    listClassMembers: mocks.listClassMembers,
    listSchools: mocks.listSchools,
    listFirstManagers: mocks.listFirstManagers,
    listMembers: mocks.listMembers,
    listClasses: mocks.listClasses,
    transact: mocks.transact,
};

describe("school tenant service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireSchoolManager.mockResolvedValue(managerContext());
        mocks.transact.mockImplementation(async (operation) => operation(repository));
        mocks.getSchool.mockResolvedValue({ id: "school-a", name: "甲学校", profile: {}, status: "active", createdAt: now, updatedAt: now });
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

    it("passes bounded class search filters to the tenant repository", async () => {
        mocks.listClasses.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });

        await listSchoolClasses("manager-user", { page: 1, pageSize: 20, keyword: "视觉", status: "active" });

        expect(mocks.listClasses).toHaveBeenCalledWith("school-a", { page: 1, pageSize: 20, keyword: "视觉", status: "active" });
    });

    it("returns the first school manager with public account identity", async () => {
        mocks.getPublicUsersByIds
            .mockResolvedValueOnce([{ id: "education-admin", role: "admin", status: "active", adminPermissions: ["education.manage"] }])
            .mockResolvedValueOnce([{ id: "manager-user", accountId: "0007", username: "teacher_a", displayName: "甲老师", email: "teacher@example.com" }]);
        mocks.listSchools.mockResolvedValue({ items: [{ id: "school-a", name: "甲学校", profile: {}, status: "active", createdAt: now, updatedAt: now }], total: 1, page: 1, pageSize: 20 });
        mocks.listFirstManagers.mockResolvedValue([{ ...member("manager-a", "teacher", ["school.manage"]), userId: "manager-user" }]);

        await expect(listSchoolsByAdmin("education-admin", { page: 1, pageSize: 20 })).resolves.toMatchObject({
            items: [{ administrator: { accountId: "0007", username: "teacher_a", displayName: "甲老师" } }],
        });
        expect(mocks.listFirstManagers).toHaveBeenCalledOnce();
        expect(mocks.getPublicUsersByIds).toHaveBeenCalledTimes(2);
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
        expect(mocks.getSchool.mock.invocationCallOrder[1]).toBeLessThan(mocks.getMembership.mock.invocationCallOrder[1]);
        expect(mocks.getSchool).toHaveBeenCalledWith("school-a", true);
    });

    it("takes the same school lock before removing a member", async () => {
        mocks.getMembership.mockResolvedValue(member("student-a", "student", []));
        mocks.deleteMembership.mockResolvedValue(true);
        await expect(removeSchoolMember("manager-a", "student-a")).resolves.toBe(true);
        expect(mocks.getSchool.mock.invocationCallOrder[0]).toBeLessThan(mocks.getMembership.mock.invocationCallOrder[0]);
        expect(mocks.getSchool).toHaveBeenCalledWith("school-a", true);
    });

    it("does not misreport repository outages as class reference conflicts", async () => {
        const outage = new Error("database unavailable");
        mocks.deleteClass.mockRejectedValueOnce(outage).mockRejectedValueOnce({ code: "23503" });

        await expect(removeSchoolClass("manager-a", "class-a")).rejects.toBe(outage);
        await expect(removeSchoolClass("manager-a", "class-a")).rejects.toMatchObject({ status: 409 });
    });

    it("rejects invalid school and member enum values before persistence", async () => {
        mocks.getPublicUsersByIds.mockResolvedValue([{ id: "education-admin", role: "admin", status: "active", adminPermissions: ["education.manage"] }]);
        await expect(updateSchoolByAdmin("education-admin", "school-a", { status: "archived" } as never)).rejects.toMatchObject({ status: 400 });
        expect(mocks.updateSchool).not.toHaveBeenCalled();

        mocks.getMembership.mockResolvedValue(member("teacher-a", "teacher", []));
        await expect(updateSchoolMember("manager-a", "teacher-a", { role: "owner", permissions: ["school.manage", "root"], status: "pending" } as never)).rejects.toMatchObject({ status: 400 });
        expect(mocks.updateMembership).not.toHaveBeenCalled();
    });

    it("does not let a school manager change the platform-controlled school status", async () => {
        await expect(updateSchoolProfile("manager-a", { name: "甲学校", status: "disabled" } as never)).rejects.toMatchObject({ status: 400 });
        expect(mocks.updateSchool).not.toHaveBeenCalled();
    });

    it("creates a class in the manager school and rejects cross-school member ids atomically", async () => {
        mocks.insertClass.mockImplementation(async (record) => record);
        await expect(createSchoolClass("manager-a", { name: "一班", description: "设计班" })).resolves.toMatchObject({ schoolId: "school-a", name: "一班" });

        mocks.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", name: "一班", description: "", status: "active", createdAt: now, updatedAt: now });
        mocks.getMembership.mockImplementation(async (_schoolId: string, membershipId: string) => (membershipId === "foreign" ? null : member(membershipId, membershipId.startsWith("teacher") ? "teacher" : "student", [])));
        await expect(replaceSchoolClassMembers("manager-a", "class-a", { teacherMembershipIds: ["teacher-a"], studentMembershipIds: ["foreign"] })).rejects.toMatchObject({ status: 404 });
        expect(mocks.replaceClassMembers).not.toHaveBeenCalled();
    });

    it("rejects invalid class status and member id shapes before persistence", async () => {
        await expect(updateSchoolClass("manager-a", "class-a", { status: "archived" } as never)).rejects.toMatchObject({ status: 400 });
        expect(mocks.updateClass).not.toHaveBeenCalled();

        mocks.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", name: "一班", description: "", status: "active", createdAt: now, updatedAt: now });
        await expect(replaceSchoolClassMembers("manager-a", "class-a", { teacherMembershipIds: [42] as never, studentMembershipIds: [] })).rejects.toMatchObject({ status: 400 });
        expect(mocks.replaceClassMembers).not.toHaveBeenCalled();
    });

    it("updates class details and members in one repository transaction", async () => {
        mocks.getClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", name: "一班", description: "", status: "active", createdAt: now, updatedAt: now });
        mocks.getMembership.mockImplementation(async (_schoolId: string, membershipId: string) => member(membershipId, membershipId.startsWith("teacher") ? "teacher" : "student", []));
        mocks.updateClass.mockResolvedValue({ id: "class-a", schoolId: "school-a", name: "设计一班", description: "", status: "active", createdAt: now, updatedAt: now });
        mocks.getPublicUsersByIds.mockImplementation(async (ids: string[]) => ids.map((id) => ({ id, accountId: id.includes("teacher") ? "0007" : "0008", username: id, displayName: id })));

        await expect(updateSchoolClassWithMembers("manager-a", "class-a", { name: "设计一班" }, { teacherMembershipIds: ["teacher-a"], studentMembershipIds: ["student-a"] })).resolves.toMatchObject({
            name: "设计一班",
            teachers: [expect.objectContaining({ id: "teacher-a" })],
            students: [expect.objectContaining({ id: "student-a" })],
        });
        expect(mocks.updateClass).toHaveBeenCalledWith("school-a", "class-a", expect.objectContaining({ name: "设计一班" }));
        expect(mocks.replaceClassMembers).toHaveBeenCalledWith("school-a", "class-a", ["teacher-a", "student-a"]);
        expect(mocks.transact).toHaveBeenCalledOnce();
    });
});

function managerContext() {
    return { school: { id: "school-a", name: "甲学校", status: "active" }, membership: { id: "manager-a", role: "teacher", permissions: ["school.manage"], status: "active" }, canManageSchool: true };
}

function member(id: string, role: "teacher" | "student", permissions: Array<"school.manage">) {
    return { id, schoolId: "school-a", userId: `${id}-user`, role, permissions, status: "active" as const, joinSource: "admin" as const, createdAt: now, updatedAt: now };
}
