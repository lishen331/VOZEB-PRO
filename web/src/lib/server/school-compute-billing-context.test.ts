import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requireActiveSchoolContext: vi.fn(),
    validateReferences: vi.fn(),
    getGroupProjectByProject: vi.fn(),
    getGroup: vi.fn(),
    getGroupMember: vi.fn(),
    getCommercialOrder: vi.fn(),
    getCanvasProject: vi.fn(),
}));

vi.mock("./school-access-service", () => ({
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
vi.mock("./school-content-reference-service", () => ({ validateSchoolContentReferences: mocks.validateReferences }));
vi.mock("./school-compute-repository", () => ({
    createSchoolComputeRepository: () => ({
        getGroupProjectByProject: mocks.getGroupProjectByProject,
        getGroup: mocks.getGroup,
        getGroupMember: mocks.getGroupMember,
    }),
}));
vi.mock("./school-domain-repository", () => ({ createSchoolDomainRepository: () => ({ getCommercialOrder: mocks.getCommercialOrder }) }));
vi.mock("./canvas-project-store", () => ({ getCanvasProject: mocks.getCanvasProject }));

import { resolveSchoolComputeBillingContext } from "./school-compute-billing-context";

const schoolContext = {
    school: { id: "school-a", status: "active" },
    membership: { id: "membership-a", status: "active" },
};
const link = {
    id: "link-a",
    schoolId: "school-a",
    groupId: "group-a",
    orderId: "order-a",
    projectType: "canvas",
    projectId: "canvas-a",
    createdByMembershipId: "membership-a",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
};

describe("resolveSchoolComputeBillingContext", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireActiveSchoolContext.mockResolvedValue(schoolContext);
        mocks.getGroupProjectByProject.mockResolvedValue(link);
        mocks.getGroup.mockResolvedValue({ id: "group-a", schoolId: "school-a", status: "active" });
        mocks.getGroupMember.mockResolvedValue({ id: "member-a", membershipId: "membership-a", groupId: "group-a", schoolId: "school-a" });
        mocks.getCommercialOrder.mockResolvedValue({ id: "order-a", assignedSchoolId: "school-a", productionGroupId: "group-a", status: "in_progress" });
        mocks.validateReferences.mockResolvedValue([{ reference: { type: "canvas", id: "canvas-a" }, title: "项目" }]);
        mocks.getCanvasProject.mockResolvedValue(null);
    });

    it("derives billing context from the owned project link", async () => {
        await expect(resolveSchoolComputeBillingContext("student-user", { surface: "canvas", projectId: "canvas-a", executionProfile: "production" })).resolves.toEqual({
            schoolId: "school-a",
            groupId: "group-a",
            orderId: "order-a",
            projectType: "canvas",
            projectId: "canvas-a",
        });
    });

    it.each<Parameters<typeof resolveSchoolComputeBillingContext>[1]>([
        { surface: "chat", projectId: "canvas-a", executionProfile: "production" },
        { surface: "canvas", projectId: "canvas-a", executionProfile: "open-source-practice" },
        { surface: "canvas", executionProfile: "production" },
    ])("returns no billing context for an ineligible task context", async (context) => {
        await expect(resolveSchoolComputeBillingContext("student-user", context)).resolves.toBeUndefined();
        expect(mocks.getGroupProjectByProject).not.toHaveBeenCalled();
    });

    it("returns no billing context for an unlinked project", async () => {
        mocks.getGroupProjectByProject.mockResolvedValue(null);
        await expect(resolveSchoolComputeBillingContext("student-user", { surface: "drama", projectId: "drama-a" })).resolves.toBeUndefined();
    });

    it("charges an episode canvas through its owning drama project association", async () => {
        mocks.getGroupProjectByProject.mockResolvedValue({ ...link, projectType: "drama", projectId: "drama-a" });
        mocks.getCanvasProject.mockResolvedValue({ id: "canvas-episode", sourceHandoffId: "drama-lab-canvas:drama-a:episode:episode-one" });
        mocks.validateReferences.mockResolvedValue([{ reference: { type: "drama", id: "drama-a" }, title: "短剧项目" }]);

        await expect(resolveSchoolComputeBillingContext("student-user", { surface: "canvas", projectId: "canvas-episode", executionProfile: "production" })).resolves.toEqual({
            schoolId: "school-a",
            groupId: "group-a",
            orderId: "order-a",
            projectType: "drama",
            projectId: "drama-a",
        });

        expect(mocks.getCanvasProject).toHaveBeenCalledWith("canvas-episode", "student-user");
        expect(mocks.getGroupProjectByProject).toHaveBeenCalledOnce();
        expect(mocks.getGroupProjectByProject).toHaveBeenCalledWith("drama", "drama-a");
        expect(mocks.validateReferences).toHaveBeenCalledWith({ userId: "student-user", schoolId: "school-a", references: [{ type: "drama", id: "drama-a" }] });
    });

    it("prefers the owning drama association over a stale canvas association", async () => {
        mocks.getCanvasProject.mockResolvedValue({ id: "canvas-episode", sourceHandoffId: "drama-lab-canvas:drama-a:episode:episode-one" });
        mocks.getGroupProjectByProject.mockImplementation(async (projectType: string) => (projectType === "drama" ? { ...link, projectType: "drama", projectId: "drama-a" } : link));
        mocks.validateReferences.mockResolvedValue([{ reference: { type: "drama", id: "drama-a" }, title: "短剧项目" }]);

        await expect(resolveSchoolComputeBillingContext("student-user", { surface: "canvas", projectId: "canvas-episode", executionProfile: "production" })).resolves.toMatchObject({
            projectType: "drama",
            projectId: "drama-a",
        });

        expect(mocks.getGroupProjectByProject).toHaveBeenCalledTimes(1);
        expect(mocks.getGroupProjectByProject).toHaveBeenCalledWith("drama", "drama-a");
        expect(mocks.validateReferences).toHaveBeenCalledWith({ userId: "student-user", schoolId: "school-a", references: [{ type: "drama", id: "drama-a" }] });
    });

    it.each([
        ["cross-school link", () => ({ ...link, schoolId: "school-b" })],
        ["inactive group", () => link],
        ["inactive order", () => link],
        ["non-member", () => link],
    ])("rejects an invalid linked project instead of falling back for %s", async (kind, makeLink) => {
        mocks.getGroupProjectByProject.mockResolvedValue(makeLink());
        if (kind === "inactive group") mocks.getGroup.mockResolvedValue({ id: "group-a", schoolId: "school-a", status: "frozen" });
        if (kind === "inactive order") mocks.getCommercialOrder.mockResolvedValue({ id: "order-a", assignedSchoolId: "school-a", productionGroupId: "group-a", status: "accepted" });
        if (kind === "non-member") mocks.getGroupMember.mockResolvedValue(null);

        await expect(resolveSchoolComputeBillingContext("student-user", { surface: "canvas", projectId: "canvas-a" })).rejects.toMatchObject({ status: 409 });
    });

    it("ignores a client-supplied billing context and uses the stored association", async () => {
        await expect(
            resolveSchoolComputeBillingContext("student-user", {
                surface: "canvas",
                projectId: "canvas-a",
                billingContext: { schoolId: "fake", groupId: "fake", orderId: "fake", projectType: "canvas", projectId: "canvas-a" },
            }),
        ).resolves.toMatchObject({ schoolId: "school-a", groupId: "group-a", orderId: "order-a" });
    });
});
