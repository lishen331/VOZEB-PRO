import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    getDetails: vi.fn(),
    update: vi.fn(),
    assign: vi.fn(),
    cancel: vi.fn(),
    review: vi.fn(),
    audit: vi.fn(),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/commercial-order-service", () => ({
    listPlatformCommercialOrders: mocks.list,
    createCommercialOrder: mocks.create,
    getPlatformCommercialOrderDetails: mocks.getDetails,
    updateCommercialOrder: mocks.update,
    assignCommercialOrder: mocks.assign,
    cancelCommercialOrder: mocks.cancel,
    reviewCommercialOrder: mocks.review,
}));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-a" })), safeRecordAuditLog: mocks.audit }));

import { GET, POST } from "./route";
import { GET as GET_DETAIL, PATCH } from "./[id]/route";
import { POST as REVIEW } from "./[id]/review/route";

describe("admin commercial orders route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["education.manage"] });
    });

    it("requires education.manage", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: [] });
        expect((await GET(new Request("http://localhost/api/admin/commercial-orders"))).status).toBe(403);
    });

    it("creates an order and audits identity and status without sensitive content", async () => {
        mocks.create.mockResolvedValue({ id: "order-a", title: "品牌短片", status: "draft", internalAmountCents: 800_000 });
        const request = new Request("http://localhost/api/admin/commercial-orders", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title: "品牌短片", requirements: "未公开需求", internalAmountCents: 800_000 }),
        });

        expect((await POST(request)).status).toBe(200);
        expect(mocks.create).toHaveBeenCalledWith("admin-a", expect.objectContaining({ internalAmountCents: 800_000 }));
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.commercial-order.create", target: { type: "commercial_order", id: "order-a" }, metadata: { status: "draft" } }));
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("800000");
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("未公开需求");
    });

    it("returns the paged formal delivery history with the platform order", async () => {
        mocks.getDetails.mockResolvedValue({ order: { id: "order-a", internalAmountCents: 800_000 }, deliveries: { items: [{ id: "delivery-a" }], total: 1, page: 2, pageSize: 10 } });

        const response = await GET_DETAIL(new Request("http://localhost/api/admin/commercial-orders/order-a?page=2&pageSize=10"), { params: Promise.resolve({ id: "order-a" }) });

        expect(response.status).toBe(200);
        expect(mocks.getDetails).toHaveBeenCalledWith("admin-a", "order-a", { page: 2, pageSize: 10 });
    });

    it("assigns one school and reviews the latest delivery through explicit actions", async () => {
        mocks.assign.mockResolvedValue({ id: "order-a", assignedSchoolId: "school-a", status: "assigned" });
        mocks.review.mockResolvedValue({ id: "order-a", status: "revision_required", internalAmountCents: 800_000 });
        const context = { params: Promise.resolve({ id: "order-a" }) };

        const assignResponse = await PATCH(
            new Request("http://localhost/api/admin/commercial-orders/order-a", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "assign", schoolId: "school-a" }),
            }),
            context,
        );
        const reviewResponse = await REVIEW(
            new Request("http://localhost/api/admin/commercial-orders/order-a/review", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ decision: "revision_required", feedback: "补充片尾" }),
            }),
            context,
        );

        expect(assignResponse.status).toBe(200);
        expect(reviewResponse.status).toBe(200);
        expect(mocks.assign).toHaveBeenCalledWith("admin-a", "order-a", "school-a");
        expect(mocks.review).toHaveBeenCalledWith("admin-a", "order-a", { decision: "revision_required", feedback: "补充片尾" });
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("800000");
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("补充片尾");
    });

    it("rejects unknown detail actions before calling the service", async () => {
        const response = await PATCH(
            new Request("http://localhost/api/admin/commercial-orders/order-a", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "publish", title: "越界更新" }),
            }),
            { params: Promise.resolve({ id: "order-a" }) },
        );

        expect(response.status).toBe(400);
        expect(mocks.update).not.toHaveBeenCalled();
    });
});
