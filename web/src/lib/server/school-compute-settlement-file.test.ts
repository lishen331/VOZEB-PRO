import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    authBefore: { version: 1, marker: "auth-before" },
    schoolBefore: { version: 1, marker: "school-before" },
    computeBefore: { version: 1, marker: "compute-before" },
    authDb: { users: [{ id: "user-a", pointsBalance: 20 }] },
    domain: {
        getPlatformCommercialOrder: vi.fn(),
        getLatestCommercialOrderDelivery: vi.fn(),
        updateCommercialOrderDelivery: vi.fn(),
        compareAndSetPlatformCommercialOrderStatus: vi.fn(),
        transact: vi.fn(),
    },
    compute: {},
    readFile: vi.fn(),
    writeFile: vi.fn(),
    writeAuth: vi.fn(),
    withLocks: vi.fn(),
    mutateDomain: vi.fn(),
    mutateCompute: vi.fn(),
    settleInside: vi.fn(),
    getPublicUsersByIds: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("@/lib/auth/store-foundation", () => ({ AUTH_DATA_FILE: "auth.json" }));
vi.mock("@/lib/auth/store-normalizers", () => ({ emptyDb: vi.fn(() => ({})), normalizeDb: vi.fn(() => mocks.authDb) }));
vi.mock("@/lib/auth/store-repository", () => ({ writeAuthDb: mocks.writeAuth }));
vi.mock("./database/postgres", () => ({ getDatabaseProvider: () => "file", withPostgresTransaction: vi.fn() }));
vi.mock("./data-adapter", () => ({ readJsonDataFile: mocks.readFile, writeJsonDataFile: mocks.writeFile, withJsonDataFileLocks: mocks.withLocks }));
vi.mock("./school-domain-file-repository", () => ({ SCHOOL_DOMAIN_DATA_FILE: "school-domain.json", mutateFileSchoolDomainInsideLock: mocks.mutateDomain }));
vi.mock("./school-compute-file-repository", () => ({ SCHOOL_COMPUTE_DATA_FILE: "school-compute.json", mutateFileSchoolComputeInsideLock: mocks.mutateCompute }));
vi.mock("./school-domain-repository", () => ({ createSchoolDomainRepository: () => mocks.domain }));
vi.mock("./school-compute-repository", () => ({ createSchoolComputeRepository: () => mocks.compute }));
vi.mock("./school-compute-settlement-service", () => ({ openCommercialOrderSettlement: vi.fn(), openCommercialOrderSettlementInsideTransaction: mocks.settleInside }));
vi.mock("./school-access-service", () => ({
    requireSchoolManager: vi.fn(),
    requireTeacher: vi.fn(),
    requireStudent: vi.fn(),
    requireActiveSchoolContext: vi.fn(),
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));
vi.mock("./school-content-reference-service", () => ({ validateSchoolContentReferences: vi.fn() }));

import { reviewCommercialOrder } from "./commercial-order-service";

describe("file commercial order settlement transaction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getPublicUsersByIds.mockResolvedValue([{ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage"] }]);
        mocks.readFile.mockImplementation(async (name: string) => structuredClone(name === "auth.json" ? mocks.authBefore : name === "school-domain.json" ? mocks.schoolBefore : mocks.computeBefore));
        mocks.withLocks.mockImplementation(async (_names: string[], operation: () => Promise<unknown>) => operation());
        mocks.mutateDomain.mockImplementation(async (operation: (repository: unknown) => Promise<unknown>) => operation(mocks.domain));
        mocks.mutateCompute.mockImplementation(async (operation: (repository: unknown) => Promise<unknown>) => operation(mocks.compute));
        mocks.domain.getPlatformCommercialOrder.mockResolvedValue({
            id: "order-a",
            title: "商单",
            assignedSchoolId: "school-a",
            productionGroupId: "group-a",
            status: "submitted",
            requirements: "",
            referenceMaterials: [],
            acceptanceCriteria: "",
            internalAmountCents: 0,
            platformFeedback: "",
            createdAt: "2026-08-21T00:00:00.000Z",
            updatedAt: "2026-08-21T00:00:00.000Z",
        });
        mocks.domain.getLatestCommercialOrderDelivery.mockResolvedValue({ id: "delivery-a", orderId: "order-a", status: "submitted" });
        mocks.domain.updateCommercialOrderDelivery.mockResolvedValue({ id: "delivery-a", orderId: "order-a", status: "accepted" });
        mocks.domain.compareAndSetPlatformCommercialOrderStatus.mockResolvedValue(true);
        mocks.settleInside.mockImplementation(async (_orderId, _school, _compute, authDb: typeof mocks.authDb) => {
            authDb.users[0].pointsBalance = 24;
            throw new Error("compute write failed");
        });
        mocks.writeFile.mockResolvedValue(undefined);
        mocks.writeAuth.mockResolvedValue(undefined);
    });

    it("restores the order, wallet and compute snapshots when settlement fails", async () => {
        await expect(reviewCommercialOrder("admin-a", "order-a", { decision: "accepted" })).rejects.toThrow("compute write failed");
        expect(mocks.domain.compareAndSetPlatformCommercialOrderStatus).toHaveBeenCalledOnce();
        expect(mocks.writeFile).toHaveBeenCalledWith("auth.json", mocks.authBefore);
        expect(mocks.writeFile).toHaveBeenCalledWith("school-domain.json", mocks.schoolBefore);
        expect(mocks.writeFile).toHaveBeenCalledWith("school-compute.json", mocks.computeBefore);
    });
});
