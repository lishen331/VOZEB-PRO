import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), hasPermission: vi.fn(), review: vi.fn(), audit: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/admin-permissions", () => ({ hasAdminPermission: mocks.hasPermission, ALL_ADMIN_PERMISSIONS: [] }));
vi.mock("@/lib/server/commercial-order-service", () => ({ reviewCommercialOrder: mocks.review }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));

import { POST } from "./route";

describe("admin commercial order review route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a" });
        mocks.hasPermission.mockReturnValue(true);
        mocks.review.mockResolvedValue({ id: "order-a", status: "accepted" });
    });

    it("passes the accepted decision to the atomic review service", async () => {
        const request = new Request("http://localhost/api/admin/commercial-orders/order-a/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "accepted", feedback: "通过" }) });
        expect((await POST(request, { params: Promise.resolve({ id: "order-a" }) })).status).toBe(200);
        expect(mocks.review).toHaveBeenCalledWith("admin-a", "order-a", { decision: "accepted", feedback: "通过" });
    });

    it("rejects an unknown review decision", async () => {
        const request = new Request("http://localhost/api/admin/commercial-orders/order-a/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision: "settled" }) });
        expect((await POST(request, { params: Promise.resolve({ id: "order-a" }) })).status).toBe(400);
        expect(mocks.review).not.toHaveBeenCalled();
    });
});
