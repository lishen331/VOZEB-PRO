import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
    const compute = {
        getGroup: vi.fn(),
        getGroupMember: vi.fn(),
        listGroups: vi.fn(),
        listGroupsForMembership: vi.fn(),
        listGroupMembers: vi.fn(),
        insertGroup: vi.fn(),
        updateGroup: vi.fn(),
        replaceGroupMembers: vi.fn(),
        getGroupProject: vi.fn(),
        getGroupProjectByProject: vi.fn(),
        insertGroupProject: vi.fn(),
        deleteGroupProject: vi.fn(),
        getAllocationRequest: vi.fn(),
        updateAllocationRequest: vi.fn(),
        insertAllocationRequest: vi.fn(),
        listAllocationRequests: vi.fn(),
        listPersonalAdvances: vi.fn(),
        allocateToGroup: vi.fn(),
        releaseGroupPoints: vi.fn(),
        transact: vi.fn(),
    };
    const school = { getMembership: vi.fn(), getCommercialOrder: vi.fn(), listCommercialOrdersForProductionGroup: vi.fn(), setCommercialOrderProductionGroup: vi.fn() };
    return {
        compute,
        school,
        requireSchoolManager: vi.fn(),
        requireActiveSchoolContext: vi.fn(),
        validateReferences: vi.fn(),
        users: vi.fn(),
        provider: "postgres",
        withLocks: vi.fn(),
        readFile: vi.fn(),
        writeFile: vi.fn(),
        mutateCompute: vi.fn(),
        mutateSchool: vi.fn(),
        postgresTransaction: vi.fn(),
    };
});

vi.mock("./school-compute-repository", () => ({ createSchoolComputeRepository: () => mocks.compute }));
vi.mock("./school-domain-repository", () => ({ createSchoolDomainRepository: () => mocks.school }));
vi.mock("./school-access-service", () => ({
    requireSchoolManager: mocks.requireSchoolManager,
    requireActiveSchoolContext: mocks.requireActiveSchoolContext,
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));
vi.mock("@/lib/auth/store-actions", () => ({ getPublicUsersByIds: mocks.users }));
vi.mock("./school-content-reference-service", () => ({ validateSchoolContentReferences: mocks.validateReferences }));
vi.mock("./database/postgres", () => ({ getDatabaseProvider: () => mocks.provider, withPostgresTransaction: mocks.postgresTransaction }));
vi.mock("./data-adapter", () => ({ withJsonDataFileLocks: mocks.withLocks, readJsonDataFile: mocks.readFile, writeJsonDataFile: mocks.writeFile }));
vi.mock("./school-compute-file-repository", () => ({ SCHOOL_COMPUTE_DATA_FILE: "school-compute.json", mutateFileSchoolComputeInsideLock: mocks.mutateCompute }));
vi.mock("./school-domain-file-repository", () => ({ SCHOOL_DOMAIN_DATA_FILE: "school-domain.json", mutateFileSchoolDomainInsideLock: mocks.mutateSchool }));

import { linkCommercialOrderToGroup, linkProjectToProductionGroup, listTeachingProductionGroups, reviewGroupAllocation, unlinkProjectFromProductionGroup, updateProductionGroup } from "./school-production-group-service";

const context = { school: { id: "school-a", name: "甲校", status: "active" }, membership: { id: "membership-a", role: "teacher", permissions: ["school.manage"], status: "active" }, canManageSchool: true };
const group = { id: "group-a", schoolId: "school-a", name: "短剧组", description: "", leaderMembershipId: "membership-a", status: "active", schoolPointsBalance: 8, createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z" } as const;

describe("school production group service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireSchoolManager.mockResolvedValue(context);
        mocks.requireActiveSchoolContext.mockResolvedValue(context);
        mocks.compute.transact.mockImplementation((operation: (repository: typeof mocks.compute) => unknown) => operation(mocks.compute));
        mocks.compute.listGroupMembers.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
        mocks.compute.getGroupMember.mockResolvedValue(null);
        mocks.school.listCommercialOrdersForProductionGroup.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
        mocks.users.mockResolvedValue([]);
        mocks.provider = "postgres";
        mocks.postgresTransaction.mockImplementation((operation: (executor: object) => unknown) => operation({}));
        mocks.withLocks.mockImplementation((_names: string[], operation: () => unknown) => operation());
        mocks.validateReferences.mockResolvedValue([{ reference: { type: "canvas", id: "canvas-a" }, title: "项目" }]);
    });

    it("allocates an approved request exactly once", async () => {
        let request = {
            id: "request-a",
            schoolId: "school-a",
            groupId: "group-a",
            orderId: "order-a",
            requestedByMembershipId: "membership-a",
            amount: 8,
            reason: "视频生成",
            status: "pending",
            reviewNote: "",
            createdAt: "2026-08-20T00:00:00.000Z",
            updatedAt: "2026-08-20T00:00:00.000Z",
        } as const;
        mocks.compute.getAllocationRequest.mockImplementation(async () => request);
        mocks.compute.updateAllocationRequest.mockImplementation(async (_schoolId, _requestId, patch) => (request = { ...request, ...patch }));
        mocks.compute.allocateToGroup.mockResolvedValue({ pool: {}, group });

        await reviewGroupAllocation("manager-a", "request-a", { decision: "approved", note: "同意" });
        await reviewGroupAllocation("manager-a", "request-a", { decision: "approved", note: "重复提交" });

        expect(mocks.compute.allocateToGroup).toHaveBeenCalledOnce();
    });

    it("uses the membership-scoped repository query for teaching pages", async () => {
        mocks.compute.listGroupsForMembership.mockResolvedValue({ items: [group], total: 1, page: 1, pageSize: 20 });
        await listTeachingProductionGroups("teacher-a", { page: 1, pageSize: 20 });
        expect(mocks.compute.listGroupsForMembership).toHaveBeenCalledWith("school-a", "membership-a", { page: 1, pageSize: 20, status: undefined });
    });

    it("checks every order page before archiving", async () => {
        mocks.compute.getGroup.mockResolvedValue(group);
        mocks.school.listCommercialOrdersForProductionGroup
            .mockResolvedValueOnce({ items: Array.from({ length: 100 }, (_, index) => ({ id: `order-${index}`, status: "accepted" })), total: 101, page: 1, pageSize: 100 })
            .mockResolvedValueOnce({ items: [{ id: "order-101", status: "in_progress" }], total: 101, page: 2, pageSize: 100 });

        await expect(updateProductionGroup("manager-a", "group-a", { status: "archived" })).rejects.toThrow("小组仍有关联中的商单");
        expect(mocks.school.listCommercialOrdersForProductionGroup).toHaveBeenCalledTimes(2);
    });

    it("restores both file snapshots when the domain write fails", async () => {
        mocks.provider = "file";
        mocks.compute.getGroup.mockResolvedValue(group);
        mocks.school.getCommercialOrder.mockResolvedValue({ id: "order-a", assignedSchoolId: "school-a", status: "in_progress" });
        mocks.school.setCommercialOrderProductionGroup.mockResolvedValue({ id: "order-a", productionGroupId: "group-a" });
        mocks.readFile.mockImplementation(async (name: string) => ({ name, version: 1 }));
        mocks.mutateCompute.mockImplementation((operation: (repository: typeof mocks.compute) => unknown) => operation(mocks.compute));
        mocks.mutateSchool.mockImplementation(async (operation: (repository: typeof mocks.school) => unknown) => {
            await operation(mocks.school);
            throw new Error("domain write failed");
        });

        await expect(linkCommercialOrderToGroup("manager-a", "group-a", "order-a")).rejects.toThrow("domain write failed");
        expect(mocks.writeFile).toHaveBeenCalledWith("school-domain.json", { name: "school-domain.json", version: 1 });
        expect(mocks.writeFile).toHaveBeenCalledWith("school-compute.json", { name: "school-compute.json", version: 1 });
    });

    it("links an owned project to an active group order", async () => {
        mocks.compute.getGroup.mockResolvedValue(group);
        mocks.compute.listGroupMembers.mockResolvedValue({ items: [{ membershipId: "membership-a" }], total: 1, page: 1, pageSize: 100 });
        mocks.compute.getGroupMember.mockResolvedValue({ membershipId: "membership-a" });
        mocks.school.getCommercialOrder.mockResolvedValue({ id: "order-a", assignedSchoolId: "school-a", productionGroupId: "group-a", status: "in_progress" });
        mocks.compute.getGroupProjectByProject.mockResolvedValue(null);
        mocks.compute.insertGroupProject.mockImplementation(async (record) => record);

        await expect(linkProjectToProductionGroup("student-a", "group-a", { orderId: "order-a", projectType: "canvas", projectId: "canvas-a" })).resolves.toMatchObject({
            groupId: "group-a",
            orderId: "order-a",
            projectType: "canvas",
            projectId: "canvas-a",
        });
        expect(mocks.validateReferences).toHaveBeenCalledWith({ userId: "student-a", schoolId: "school-a", references: [{ type: "canvas", id: "canvas-a" }] });
    });

    it("rejects a project link from a non-member", async () => {
        mocks.compute.getGroup.mockResolvedValue(group);
        mocks.compute.listGroupMembers.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
        mocks.compute.getGroupMember.mockResolvedValue(null);

        await expect(linkProjectToProductionGroup("student-a", "group-a", { orderId: "order-a", projectType: "canvas", projectId: "canvas-a" })).rejects.toMatchObject({ status: 403 });
        expect(mocks.compute.insertGroupProject).not.toHaveBeenCalled();
    });

    it("rejects linking a project to a second unsettled order", async () => {
        mocks.compute.getGroup.mockResolvedValue(group);
        mocks.compute.listGroupMembers.mockResolvedValue({ items: [{ membershipId: "membership-a" }], total: 1, page: 1, pageSize: 100 });
        mocks.compute.getGroupMember.mockResolvedValue({ membershipId: "membership-a" });
        mocks.school.getCommercialOrder.mockResolvedValue({ id: "order-b", assignedSchoolId: "school-a", productionGroupId: "group-a", status: "revision_required" });
        mocks.compute.getGroupProjectByProject.mockResolvedValue({ id: "link-a", schoolId: "school-a", groupId: "group-a", orderId: "order-a", projectType: "canvas", projectId: "canvas-a" });

        await expect(linkProjectToProductionGroup("student-a", "group-a", { orderId: "order-b", projectType: "canvas", projectId: "canvas-a" })).rejects.toMatchObject({ status: 409 });
    });

    it("allows the leader to unlink a project association", async () => {
        mocks.compute.getGroup.mockResolvedValue(group);
        mocks.compute.getGroupProject.mockResolvedValue({ id: "link-a", schoolId: "school-a", groupId: "group-a", orderId: "order-a", projectType: "canvas", projectId: "canvas-a" });
        mocks.compute.deleteGroupProject.mockResolvedValue(true);

        await expect(unlinkProjectFromProductionGroup("student-a", "group-a", "link-a")).resolves.toEqual({ removed: true });
        expect(mocks.compute.deleteGroupProject).toHaveBeenCalledWith("school-a", "group-a", "link-a");
    });
});
