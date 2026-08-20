import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), create: vi.fn(), list: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-compute-advance-service", () => ({ createPersonalAdvance: mocks.create, listOwnPersonalAdvances: mocks.list }));

import { GET, POST } from "./route";

describe("teaching personal advances route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "student-a" });
        mocks.create.mockResolvedValue({ id: "advance-a", originalPoints: 12.5, remainingPoints: 12.5, consumedPoints: 0, returnedPoints: 0 });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });
    });

    it("creates a decimal advance for the signed-in member", async () => {
        const request = new Request("http://localhost/api/teaching/production-groups/group-a/personal-advances", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: "order-a", amount: 12.5, idempotencyKey: "advance-a", userId: "user-b" }),
        });
        const response = await POST(request, { params: Promise.resolve({ id: "group-a" }) });
        expect(response.status).toBe(200);
        expect(mocks.create).toHaveBeenCalledWith("student-a", "group-a", { orderId: "order-a", amount: 12.5, idempotencyKey: "advance-a" });
    });

    it("lists the signed-in member advances and ignores tenant selectors", async () => {
        const response = await GET(new Request("http://localhost/api/teaching/production-groups/group-a/personal-advances?schoolId=school-b&membershipId=member-b&page=2&pageSize=10"), { params: Promise.resolve({ id: "group-a" }) });
        expect(response.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("student-a", "group-a", { page: 2, pageSize: 10 });
    });

    it("rejects invalid numeric input before calling the service", async () => {
        const request = new Request("http://localhost/api/teaching/production-groups/group-a/personal-advances", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ orderId: "order-a", amount: "12.5", idempotencyKey: "advance-a" }),
        });
        expect((await POST(request, { params: Promise.resolve({ id: "group-a" }) })).status).toBe(400);
        expect(mocks.create).not.toHaveBeenCalled();
    });
});
