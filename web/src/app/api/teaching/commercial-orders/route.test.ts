import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn(), submissions: vi.fn(), participants: vi.fn(), candidate: vi.fn(), delivery: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/commercial-order-service", () => ({
    listTeachingCommercialOrders: mocks.list,
    listCommercialOrderSubmissions: mocks.submissions,
    configureCommercialOrderParticipants: mocks.participants,
    submitCommercialOrderWork: mocks.candidate,
    submitCommercialOrderDelivery: mocks.delivery,
}));

import { GET } from "./route";
import { GET as GET_SUBMISSIONS, POST } from "./[id]/submissions/route";

describe("teaching commercial orders route", () => {
    beforeEach(() => vi.clearAllMocks());

    it("uses the active member identity and ignores tenant selectors", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "student-a" });
        mocks.list.mockResolvedValue({ items: [{ id: "order-a", status: "in_progress" }], total: 1, page: 1, pageSize: 20 });

        const response = await GET(new Request("http://localhost/api/teaching/commercial-orders?schoolId=school-b&page=2&pageSize=10"));
        expect(response.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("student-a", { page: 2, pageSize: 10 });
        expect(JSON.stringify(await response.json())).not.toContain("internalAmountCents");
    });

    it("routes candidate and delivery submissions without changing their references", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "member-a" });
        mocks.candidate.mockResolvedValue({ id: "candidate-a" });
        mocks.delivery.mockResolvedValue({ id: "delivery-a" });
        const context = { params: Promise.resolve({ id: "order-a" }) };

        await POST(
            new Request("http://localhost/api/teaching/commercial-orders/order-a/submissions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "candidate", note: "候选", references: [{ type: "asset", id: "asset-a" }] }),
            }),
            context,
        );
        await POST(
            new Request("http://localhost/api/teaching/commercial-orders/order-a/submissions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "delivery", note: "交付", references: [{ type: "generation", id: "generation-a" }] }),
            }),
            context,
        );

        expect(mocks.candidate).toHaveBeenCalledWith("member-a", "order-a", { note: "候选", references: [{ type: "asset", id: "asset-a" }] });
        expect(mocks.delivery).toHaveBeenCalledWith("member-a", "order-a", { note: "交付", references: [{ type: "generation", id: "generation-a" }] });
    });

    it("routes participant arrangement to the responsible teacher service", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "teacher-a" });
        mocks.participants.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
        const context = { params: Promise.resolve({ id: "order-a" }) };

        const response = await POST(
            new Request("http://localhost/api/teaching/commercial-orders/order-a/submissions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "participants", participantMembershipIds: ["student-a"] }),
            }),
            context,
        );

        expect(response.status).toBe(200);
        expect(mocks.participants).toHaveBeenCalledWith("teacher-a", "order-a", ["student-a"]);
    });

    it("forwards submission history pagination without trusting tenant selectors", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "teacher-a" });
        mocks.submissions.mockResolvedValue({ participants: { items: [], total: 0, page: 3, pageSize: 5 }, deliveries: { items: [], total: 0, page: 3, pageSize: 5 } });

        const response = await GET_SUBMISSIONS(new Request("http://localhost/api/teaching/commercial-orders/order-a/submissions?schoolId=school-b&page=3&pageSize=5"), { params: Promise.resolve({ id: "order-a" }) });

        expect(response.status).toBe(200);
        expect(mocks.submissions).toHaveBeenCalledWith("teacher-a", "order-a", { page: 3, pageSize: 5 });
    });
});
