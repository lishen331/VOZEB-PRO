import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getSchoolContextByUserId: vi.fn(),
}));

vi.mock("@/lib/server/school-domain-repository", () => ({
    createSchoolDomainRepository: () => ({ getSchoolContextByUserId: mocks.getSchoolContextByUserId }),
}));

import { getSchoolContextForUser, requireActiveSchoolContext, requireSchoolManager, requireStudent, requireTeacher } from "./school-access-service";

describe("school access service", () => {
    beforeEach(() => mocks.getSchoolContextByUserId.mockReset());

    it("maps the active repository context to the public school context", async () => {
        mocks.getSchoolContextByUserId.mockResolvedValue(context("teacher", ["school.manage"]));

        await expect(getSchoolContextForUser("manager-a")).resolves.toMatchObject({ school: { id: "school-a" }, membership: { id: "member-a" }, canManageSchool: true });
    });

    it("rejects missing and disabled school contexts", async () => {
        mocks.getSchoolContextByUserId
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(context("teacher", [], "disabled"))
            .mockResolvedValueOnce(context("teacher", [], "active", "disabled"));

        await expect(requireActiveSchoolContext("plain-user")).rejects.toMatchObject({ status: 403 });
        await expect(requireActiveSchoolContext("disabled-member")).rejects.toMatchObject({ status: 403 });
        await expect(requireActiveSchoolContext("disabled-school")).rejects.toMatchObject({ status: 403 });
    });

    it("enforces the manager, teacher and student matrix", async () => {
        mocks.getSchoolContextByUserId.mockResolvedValue(context("teacher", ["school.manage"]));
        await expect(requireSchoolManager("manager-a")).resolves.toMatchObject({ canManageSchool: true });
        await expect(requireTeacher("manager-a")).resolves.toMatchObject({ membership: { role: "teacher" } });
        await expect(requireStudent("manager-a")).rejects.toMatchObject({ status: 403 });

        mocks.getSchoolContextByUserId.mockResolvedValue(context("teacher", []));
        await expect(requireSchoolManager("teacher-a")).rejects.toMatchObject({ status: 403 });
        await expect(requireTeacher("teacher-a")).resolves.toMatchObject({ membership: { role: "teacher" } });

        mocks.getSchoolContextByUserId.mockResolvedValue(context("student", []));
        await expect(requireTeacher("student-a")).rejects.toMatchObject({ status: 403 });
        await expect(requireStudent("student-a")).resolves.toMatchObject({ membership: { role: "student" } });
    });
});

function context(role: "teacher" | "student", permissions: Array<"school.manage">, memberStatus: "active" | "disabled" = "active", schoolStatus: "active" | "disabled" = "active") {
    return {
        school: { id: "school-a", name: "甲学校", profile: {}, status: schoolStatus, createdAt: "2026-08-17T00:00:00.000Z", updatedAt: "2026-08-17T00:00:00.000Z" },
        membership: { id: "member-a", schoolId: "school-a", userId: "user-a", role, permissions, status: memberStatus, joinSource: "admin", createdAt: "2026-08-17T00:00:00.000Z", updatedAt: "2026-08-17T00:00:00.000Z" },
        canManageSchool: role === "teacher" && permissions.includes("school.manage"),
    };
}
