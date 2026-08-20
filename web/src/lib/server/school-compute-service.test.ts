import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getPublicUsersByIds: vi.fn(),
    schoolRepository: { listSchools: vi.fn(), listSchoolsByIds: vi.fn(), getSchool: vi.fn() },
    computeRepository: {
        getPool: vi.fn(),
        getPoolMetrics: vi.fn(),
        upsertPool: vi.fn(),
        listPoolsBySchoolIds: vi.fn(),
        listPoolMetricsBySchoolIds: vi.fn(),
        listPoolMetricsPage: vi.fn(),
        listLedger: vi.fn(),
        getLedgerEntryByIdempotencyKey: vi.fn(),
        creditPool: vi.fn(),
        adjustPool: vi.fn(),
        transact: vi.fn(),
    },
    requireActiveSchoolContext: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("@/lib/server/school-domain-repository", () => ({ createSchoolDomainRepository: () => mocks.schoolRepository }));
vi.mock("@/lib/server/school-compute-repository", () => ({ createSchoolComputeRepository: () => mocks.computeRepository }));
vi.mock("@/lib/server/school-access-service", () => ({ requireActiveSchoolContext: mocks.requireActiveSchoolContext }));

import { adjustSchoolComputePool, creditSchoolComputePool, getAdminSchoolComputePool, getCurrentSchoolComputePool, listAdminSchoolComputePools, setSchoolComputePoolStatus } from "./school-compute-service";

const school = { id: "school-a", name: "学校 A", profile: {}, status: "active", createdAt: "2026-08-20T00:00:00.000Z", updatedAt: "2026-08-20T00:00:00.000Z" };
const pool = { schoolId: "school-a", availablePoints: 12.5, status: "active", createdAt: school.createdAt, updatedAt: school.updatedAt } as const;

describe("school compute service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getPublicUsersByIds.mockImplementation(async (ids: string[]) => ids.map((id) => ({ id, role: "admin", status: "active", adminPermissions: ["education.manage", "billing.manage"], accountId: id, username: id, displayName: id })));
        mocks.schoolRepository.listSchools.mockResolvedValue({ items: [school], total: 1, page: 1, pageSize: 20 });
        mocks.schoolRepository.listSchoolsByIds.mockResolvedValue([school]);
        mocks.schoolRepository.getSchool.mockResolvedValue(school);
        mocks.computeRepository.listPoolsBySchoolIds.mockResolvedValue([pool]);
        mocks.computeRepository.listLedger.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
        mocks.computeRepository.getPool.mockResolvedValue(pool);
        mocks.computeRepository.getPoolMetrics.mockResolvedValue({ ...pool, totalPoints: 12.5, allocatedPoints: 0, consumedPoints: 0 });
        mocks.computeRepository.listPoolMetricsBySchoolIds.mockResolvedValue([{ ...pool, totalPoints: 12.5, allocatedPoints: 0, consumedPoints: 0 }]);
        mocks.computeRepository.listPoolMetricsPage.mockResolvedValue({ items: [{ ...pool, totalPoints: 12.5, allocatedPoints: 0, consumedPoints: 0 }], total: 1, page: 1, pageSize: 20 });
        mocks.computeRepository.transact.mockImplementation(async (operation: (repository: typeof mocks.computeRepository) => unknown) => operation(mocks.computeRepository));
        mocks.computeRepository.getLedgerEntryByIdempotencyKey.mockResolvedValue(null);
        mocks.computeRepository.upsertPool.mockResolvedValue(pool);
        mocks.computeRepository.creditPool.mockResolvedValue(pool);
        mocks.computeRepository.adjustPool.mockResolvedValue(pool);
        mocks.requireActiveSchoolContext.mockResolvedValue({ school: { id: "school-a", name: "学校 A", status: "active" }, membership: { id: "member-a", role: "student", permissions: [], status: "active" }, canManageSchool: false });
    });

    it("allows read access to education or billing administrators and maps missing pools to zero", async () => {
        mocks.getPublicUsersByIds.mockResolvedValueOnce([{ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage"], accountId: "0001", username: "admin", displayName: "管理员" }]);
        mocks.computeRepository.listPoolMetricsBySchoolIds.mockResolvedValue([]);

        const result = await listAdminSchoolComputePools("admin-a", {});

        expect(result.items[0]).toMatchObject({ schoolId: "school-a", schoolName: "学校 A", availablePoints: 0, totalPoints: 0, allocatedPoints: 0, consumedPoints: 0, status: "active" });
    });

    it("rejects credit unless both education and billing permissions are present", async () => {
        mocks.getPublicUsersByIds.mockResolvedValueOnce([{ id: "finance", role: "admin", status: "active", adminPermissions: ["billing.manage"], accountId: "0001", username: "finance", displayName: "财务" }]);
        await expect(creditSchoolComputePool("finance", "school-a", { amount: 12.5, reason: "合同首充", idempotencyKey: "contract-a" })).rejects.toMatchObject({ status: 403 });
        expect(mocks.computeRepository.creditPool).not.toHaveBeenCalled();
    });

    it("creates a pool before the first credit and reuses an idempotency key", async () => {
        mocks.computeRepository.getPool.mockResolvedValueOnce(null).mockResolvedValue(pool);
        mocks.computeRepository.creditPool.mockResolvedValueOnce({ ...pool, availablePoints: 12.5 });

        const first = await creditSchoolComputePool("admin-a", "school-a", { amount: 12.5, reason: "合同首充", idempotencyKey: "contract-a" });
        mocks.computeRepository.getLedgerEntryByIdempotencyKey.mockResolvedValueOnce({ id: "ledger-a", schoolId: "school-a", type: "credit", idempotencyKey: "contract-a" });
        const second = await creditSchoolComputePool("admin-a", "school-a", { amount: 12.5, reason: "合同首充", idempotencyKey: "contract-a" });

        expect(first.availablePoints).toBe(12.5);
        expect(second.availablePoints).toBe(12.5);
        expect(mocks.computeRepository.upsertPool).toHaveBeenCalledOnce();
        expect(mocks.computeRepository.creditPool).toHaveBeenCalledOnce();
    });

    it("rejects disabled schools and zero adjustments", async () => {
        mocks.schoolRepository.getSchool.mockResolvedValueOnce({ ...school, status: "disabled" });
        await expect(creditSchoolComputePool("admin-a", "school-a", { amount: 12.5, reason: "合同首充", idempotencyKey: "contract-a" })).rejects.toMatchObject({ status: 409 });
        await expect(adjustSchoolComputePool("admin-a", "school-a", { amount: 0, reason: "修正", idempotencyKey: "adjust-a" })).rejects.toMatchObject({ status: 400 });
    });

    it("rejects frozen pools and adjustments that would make the balance negative", async () => {
        mocks.computeRepository.getPool.mockResolvedValueOnce({ ...pool, status: "frozen" });
        await expect(creditSchoolComputePool("admin-a", "school-a", { amount: 1, reason: "补充", idempotencyKey: "credit-frozen" })).rejects.toMatchObject({ status: 409 });
        mocks.computeRepository.getPool.mockResolvedValueOnce(pool);
        await expect(adjustSchoolComputePool("admin-a", "school-a", { amount: -20, reason: "修正", idempotencyKey: "adjust-negative" })).rejects.toMatchObject({ status: 409 });
        expect(mocks.computeRepository.creditPool).not.toHaveBeenCalled();
        expect(mocks.computeRepository.adjustPool).not.toHaveBeenCalled();
    });

    it("freezes and activates a pool with management permissions", async () => {
        mocks.computeRepository.getPool.mockResolvedValueOnce(pool).mockResolvedValueOnce({ ...pool, status: "frozen" });
        mocks.computeRepository.getPoolMetrics.mockResolvedValueOnce({ ...pool, status: "frozen", totalPoints: 12.5, allocatedPoints: 0, consumedPoints: 0 });
        mocks.computeRepository.upsertPool.mockResolvedValue({ ...pool, status: "frozen" });
        const result = await setSchoolComputePoolStatus("admin-a", "school-a", "frozen");
        expect(result.status).toBe("frozen");
        expect(mocks.computeRepository.upsertPool).toHaveBeenCalledWith(expect.objectContaining({ schoolId: "school-a", status: "frozen" }));
    });

    it("returns only the active school context for a school member", async () => {
        const result = await getCurrentSchoolComputePool("student-a");
        expect(result).toMatchObject({ schoolId: "school-a", availablePoints: 12.5, status: "active" });
    });

    it("keeps the current school id when its pool has not been created", async () => {
        mocks.computeRepository.getPoolMetrics.mockResolvedValue(null);
        await expect(getCurrentSchoolComputePool("student-a")).resolves.toEqual({ schoolId: "school-a", totalPoints: 0, availablePoints: 0, allocatedPoints: 0, consumedPoints: 0, status: "active" });
    });

    it("returns a cross-school admin detail as not found", async () => {
        mocks.schoolRepository.getSchool.mockResolvedValue(null);
        await expect(getAdminSchoolComputePool("admin-a", "school-b")).rejects.toMatchObject({ status: 404 });
    });

    it("uses repository aggregates instead of the current ledger page for totals", async () => {
        mocks.computeRepository.getPoolMetrics.mockResolvedValue({ ...pool, totalPoints: 100, availablePoints: 50, allocatedPoints: 20, consumedPoints: 30 });
        mocks.computeRepository.listLedger.mockResolvedValue({ items: [{ id: "latest", schoolId: "school-a", type: "credit", amount: 1, balanceAfter: 50, idempotencyKey: "latest", createdAt: school.updatedAt }], total: 220, page: 1, pageSize: 20 });
        await expect(getAdminSchoolComputePool("admin-a", "school-a")).resolves.toMatchObject({ totalPoints: 100, availablePoints: 50, allocatedPoints: 20, consumedPoints: 30, ledger: { total: 220, items: [{ id: "latest" }] } });
    });

    it("keeps pool status filtering totals and pages when missing pools default to active", async () => {
        const schools = [school, { ...school, id: "school-b", name: "学校 B" }, { ...school, id: "school-c", name: "学校 C" }];
        mocks.schoolRepository.listSchools.mockImplementation(async ({ page, pageSize }: { page?: number; pageSize?: number }) => {
            const currentPage = page || 1;
            const size = pageSize || 20;
            return { items: schools.slice((currentPage - 1) * size, currentPage * size), total: schools.length, page: currentPage, pageSize: size };
        });
        const metrics = [
            { ...pool, schoolId: "school-a", status: "active", totalPoints: 0, allocatedPoints: 0, consumedPoints: 0 },
            { ...pool, schoolId: "school-b", status: "frozen", totalPoints: 12.5, allocatedPoints: 0, consumedPoints: 0 },
            { ...pool, schoolId: "school-c", status: "active", totalPoints: 0, allocatedPoints: 0, consumedPoints: 0 },
        ];
        mocks.computeRepository.listPoolMetricsPage.mockResolvedValue({ items: [metrics[0]], total: 2, page: 1, pageSize: 1 });
        mocks.schoolRepository.listSchoolsByIds.mockResolvedValue(schools);

        const first = await listAdminSchoolComputePools("admin-a", { page: 1, pageSize: 1, status: "active" });
        mocks.computeRepository.listPoolMetricsPage.mockResolvedValue({ items: [metrics[2]], total: 2, page: 2, pageSize: 1 });
        const second = await listAdminSchoolComputePools("admin-a", { page: 2, pageSize: 1, status: "active" });

        expect(first).toMatchObject({ total: 2, page: 1, pageSize: 1, items: [{ schoolId: "school-a" }] });
        expect(second).toMatchObject({ total: 2, page: 2, pageSize: 1, items: [{ schoolId: "school-c" }] });
    });
});
