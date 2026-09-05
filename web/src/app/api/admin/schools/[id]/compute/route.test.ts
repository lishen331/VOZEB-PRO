import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), get: vi.fn(), listLedger: vi.fn(), credit: vi.fn(), adjust: vi.fn(), status: vi.fn(), audit: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-a" })), safeRecordAuditLog: mocks.audit }));
vi.mock("@/lib/server/school-compute-service", () => ({
    getAdminSchoolComputePool: mocks.get,
    listAdminSchoolComputeLedger: mocks.listLedger,
    creditSchoolComputePool: mocks.credit,
    adjustSchoolComputePool: mocks.adjust,
    setSchoolComputePoolStatus: mocks.status,
}));

import { GET, PATCH } from "./route";
import { POST as POSTCredit } from "./credit/route";
import { GET as GETLedger } from "./ledger/route";

const context = { params: Promise.resolve({ id: "school-a" }) };

describe("admin school compute detail route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.get.mockResolvedValue({ schoolId: "school-a", schoolName: "学校 A", status: "active", ledger: { items: [], total: 0, page: 1, pageSize: 20 } });
        mocks.adjust.mockResolvedValue({ schoolId: "school-a", ledger: { items: [{ id: "ledger-a", idempotencyKey: "adjust-a" }] } });
        mocks.credit.mockResolvedValue({ schoolId: "school-a", ledger: { items: [{ id: "ledger-credit", idempotencyKey: "contract-a" }] } });
        mocks.status.mockResolvedValue({ schoolId: "school-a", status: "frozen", ledger: { items: [] } });
        mocks.listLedger.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
    });

    it("allows read access with either permission", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["billing.manage"] });
        const response = await GET(new Request("http://localhost/api/admin/schools/school-a/compute"), context);
        expect(response.status).toBe(200);
        expect(mocks.get).toHaveBeenCalledWith("admin-a", "school-a");
    });

    it("requires both permissions for adjustment", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["billing.manage"] });
        const response = await PATCH(
            new Request("http://localhost/api/admin/schools/school-a/compute", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: -1, reason: "修正", idempotencyKey: "adjust-a" }) }),
            context,
        );
        expect(response.status).toBe(403);
        expect(mocks.adjust).not.toHaveBeenCalled();
    });

    it("adjusts, freezes and audits stable metadata", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage", "billing.manage"] });
        const adjustResponse = await PATCH(
            new Request("http://localhost/api/admin/schools/school-a/compute", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: -1, reason: "合同修正", idempotencyKey: "adjust-a" }) }),
            context,
        );
        const statusResponse = await PATCH(new Request("http://localhost/api/admin/schools/school-a/compute", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "frozen" }) }), context);
        expect(adjustResponse.status).toBe(200);
        expect(statusResponse.status).toBe(200);
        expect(mocks.audit).toHaveBeenCalledWith(
            expect.objectContaining({ action: "admin.school-compute.adjust", target: { type: "school_compute_pool", id: "school-a" }, metadata: { schoolId: "school-a", amount: -1, reason: "合同修正", ledgerId: "ledger-a" } }),
        );
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.school-compute.freeze" }));
    });

    it("credits once through the dedicated endpoint and records the ledger id", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage", "billing.manage"] });
        const response = await POSTCredit(
            new Request("http://localhost/api/admin/schools/school-a/compute/credit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount: 12.5, reason: "合同首充", idempotencyKey: "contract-a" }) }),
            context,
        );
        expect(response.status).toBe(200);
        expect(mocks.credit).toHaveBeenCalledWith("admin-a", "school-a", { amount: 12.5, reason: "合同首充", idempotencyKey: "contract-a" });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.school-compute.credit", metadata: { schoolId: "school-a", amount: 12.5, reason: "合同首充", ledgerId: "ledger-credit" } }));
    });

    it("caps ledger page size at one hundred", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["billing.manage"] });
        await GETLedger(new Request("http://localhost/api/admin/schools/school-a/compute/ledger?pageSize=999"), context);
        expect(mocks.listLedger).toHaveBeenCalledWith("admin-a", "school-a", expect.objectContaining({ pageSize: 100 }));
    });
});
