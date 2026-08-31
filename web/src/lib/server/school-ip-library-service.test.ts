import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requireSchoolManager: vi.fn(),
    listSchoolGrants: vi.fn(),
    getIpPackage: vi.fn(),
    updateSchoolGrant: vi.fn(),
}));

vi.mock("./school-access-service", () => ({
    requireSchoolManager: mocks.requireSchoolManager,
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public readonly status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));
vi.mock("./ip-library-access-service", () => ({
    createIpLibraryRepository: () => ({ listSchoolGrants: mocks.listSchoolGrants, getIpPackage: mocks.getIpPackage, updateSchoolGrant: mocks.updateSchoolGrant }),
}));

import { listSchoolIpAccess, updateSchoolIpMemberAccess } from "./school-ip-library-service";

const grant = {
    id: "grant-a",
    ipId: "ip-a",
    schoolId: "school-a",
    mode: "exclusive" as const,
    status: "active" as const,
    startsAt: "2026-08-01T00:00:00.000Z",
    endsAt: "2026-09-01T00:00:00.000Z",
    note: "",
    memberAccessEnabled: false,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
};

describe("school IP library service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireSchoolManager.mockResolvedValue({ school: { id: "school-a", status: "active" }, membership: { role: "teacher", status: "active" }, canManageSchool: true });
        mocks.listSchoolGrants.mockResolvedValue({ items: [grant], total: 1, page: 1, pageSize: 20 });
        mocks.getIpPackage.mockResolvedValue({ id: "ip-a", title: "星海计划", summary: "教学 IP", status: "published", currentVersionId: "version-a" });
        mocks.updateSchoolGrant.mockImplementation(async (_ipId, _grantId, patch) => ({ ...grant, ...patch }));
    });

    it("derives the school from the manager session and reports effective access", async () => {
        const page = await listSchoolIpAccess("manager-a", { page: 1, pageSize: 20 }, new Date("2026-08-20T00:00:00.000Z"));
        expect(mocks.listSchoolGrants).toHaveBeenCalledWith({ schoolId: "school-a", page: 1, pageSize: 20 });
        expect(page.items[0]).toMatchObject({ id: "grant-a", title: "星海计划", memberAccessEnabled: false, effective: false });
    });

    it("only updates a grant belonging to the current school", async () => {
        const updated = await updateSchoolIpMemberAccess("manager-a", "grant-a", true);
        expect(mocks.listSchoolGrants).toHaveBeenCalledWith({ schoolId: "school-a", grantId: "grant-a", page: 1, pageSize: 1 });
        expect(mocks.updateSchoolGrant).toHaveBeenCalledWith("ip-a", "grant-a", expect.objectContaining({ memberAccessEnabled: true, memberAccessUpdatedByUserId: "manager-a", memberAccessUpdatedAt: expect.any(String), updatedAt: expect.any(String) }));
        expect(updated.memberAccessEnabled).toBe(true);
    });

    it("returns 404 for a grant outside the current school", async () => {
        mocks.listSchoolGrants.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 1 });
        await expect(updateSchoolIpMemberAccess("manager-a", "grant-b", true)).rejects.toMatchObject({ status: 404 });
        expect(mocks.updateSchoolGrant).not.toHaveBeenCalled();
    });

    it("keeps suspended access ineffective without clearing the stored switch", async () => {
        mocks.listSchoolGrants.mockResolvedValue({ items: [{ ...grant, status: "suspended", memberAccessEnabled: true }], total: 1, page: 1, pageSize: 20 });
        const page = await listSchoolIpAccess("manager-a", {}, new Date("2026-08-20T00:00:00.000Z"));
        expect(page.items[0]).toMatchObject({ status: "suspended", memberAccessEnabled: true, effective: false });
    });
});
