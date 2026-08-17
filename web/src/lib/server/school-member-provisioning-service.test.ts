import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requireSchoolManager: vi.fn(),
    getSchoolContextForUser: vi.fn(),
    createOrdinaryUsersForSchool: vi.fn(),
    getMembershipByUserId: vi.fn(),
    getInviteCodeByRole: vi.fn(),
    getInviteCodeByDigest: vi.fn(),
    upsertInviteCode: vi.fn(),
    insertMembership: vi.fn(),
    transact: vi.fn(),
}));

vi.mock("./school-access-service", () => ({
    requireSchoolManager: mocks.requireSchoolManager,
    getSchoolContextForUser: mocks.getSchoolContextForUser,
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));
vi.mock("@/lib/auth/store", () => ({ createOrdinaryUsersForSchool: mocks.createOrdinaryUsersForSchool }));
vi.mock("@/lib/server/school-domain-repository", () => ({ createSchoolDomainRepository: () => repository }));

import { createSchoolMembers, importSchoolMembers, joinSchoolByInvite, rotateSchoolInviteCode } from "./school-member-provisioning-service";

const repository = {
    getMembershipByUserId: mocks.getMembershipByUserId,
    getInviteCodeByRole: mocks.getInviteCodeByRole,
    getInviteCodeByDigest: mocks.getInviteCodeByDigest,
    upsertInviteCode: mocks.upsertInviteCode,
    insertMembership: mocks.insertMembership,
    transact: mocks.transact,
};

describe("school member provisioning service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireSchoolManager.mockResolvedValue({ school: { id: "school-a", status: "active" }, membership: { id: "manager-a", role: "teacher", permissions: ["school.manage"], status: "active" }, canManageSchool: true });
        mocks.transact.mockImplementation(async (operation) => operation(repository));
    });

    it("validates an entire import before creating any account", async () => {
        await expect(
            createSchoolMembers("manager-a", [
                { username: "teacher_a", displayName: "老师", password: "password-123", role: "teacher" },
                { username: "teacher_a", displayName: "重复", password: "password-123", role: "student" },
            ]),
        ).rejects.toThrow("重复");
        expect(mocks.createOrdinaryUsersForSchool).not.toHaveBeenCalled();
    });

    it("delegates account and membership creation as one atomic operation", async () => {
        mocks.createOrdinaryUsersForSchool.mockResolvedValue([{ id: "membership-a", accountId: "0007", username: "teacher_a", displayName: "老师", role: "teacher", permissions: [], status: "active" }]);

        await expect(createSchoolMembers("manager-a", [{ username: "teacher_a", displayName: "老师", password: "password-123", role: "teacher" }])).resolves.toEqual([expect.objectContaining({ accountId: "0007", role: "teacher" })]);
        expect(mocks.createOrdinaryUsersForSchool).toHaveBeenCalledWith("school-a", expect.any(Array), { joinSource: "admin" });

        await importSchoolMembers("manager-a", [{ username: "student_a", displayName: "学生", password: "password-123", role: "student" }]);
        expect(mocks.createOrdinaryUsersForSchool).toHaveBeenLastCalledWith("school-a", expect.any(Array), { joinSource: "import" });
    });

    it("rotates role-specific invite codes and only stores a digest", async () => {
        mocks.upsertInviteCode.mockImplementation(async (record) => record);
        const result = await rotateSchoolInviteCode("manager-a", "student");

        expect(result.code).toMatch(/^[A-Z0-9-]+$/);
        expect(mocks.upsertInviteCode).toHaveBeenCalledWith(expect.objectContaining({ schoolId: "school-a", role: "student", codeDigest: expect.not.stringContaining(result.code) }));
    });

    it("prevents an existing member from joining another school", async () => {
        mocks.getSchoolContextForUser.mockResolvedValue({ school: { id: "school-b" } });

        await expect(joinSchoolByInvite("user-a", "SCHOOL-CODE")).rejects.toThrow("已经加入");
        expect(mocks.insertMembership).not.toHaveBeenCalled();
    });
});
