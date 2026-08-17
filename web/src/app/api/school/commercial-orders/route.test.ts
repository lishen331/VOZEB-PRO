import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn(), get: vi.fn(), configure: vi.fn(), start: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/commercial-order-service", () => ({
    listSchoolCommercialOrders: mocks.list,
    getSchoolCommercialOrder: mocks.get,
    configureCommercialOrder: mocks.configure,
    startCommercialOrder: mocks.start,
}));

import { GET } from "./route";
import { PATCH } from "./[id]/route";

describe("school commercial orders route", () => {
    beforeEach(() => vi.clearAllMocks());

    it("derives the school from the current manager and never returns an internal amount", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "manager-a" });
        mocks.list.mockResolvedValue({ items: [{ id: "order-a", title: "品牌短片", status: "assigned" }], total: 1, page: 1, pageSize: 20 });

        const response = await GET(new Request("http://localhost/api/school/commercial-orders?schoolId=school-b&page=1"));
        expect(response.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("manager-a", { page: 1, pageSize: 20 });
        expect(JSON.stringify(await response.json())).not.toContain("internalAmountCents");
    });

    it("configures and starts the assigned order as the current manager", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "manager-a" });
        mocks.configure.mockResolvedValue({ id: "order-a", status: "assigned" });
        mocks.start.mockResolvedValue({ id: "order-a", status: "in_progress" });
        const context = { params: Promise.resolve({ id: "order-a" }) };

        await PATCH(
            new Request("http://localhost/api/school/commercial-orders/order-a", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "configure", teacherMembershipId: "teacher-a", classId: "class-a", participantMembershipIds: ["student-a"] }),
            }),
            context,
        );
        await PATCH(
            new Request("http://localhost/api/school/commercial-orders/order-a", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "start" }),
            }),
            context,
        );

        expect(mocks.configure).toHaveBeenCalledWith("manager-a", "order-a", { teacherMembershipId: "teacher-a", classId: "class-a", participantMembershipIds: ["student-a"] });
        expect(mocks.start).toHaveBeenCalledWith("manager-a", "order-a");
    });

    it("rejects a non-string optional class instead of silently dropping it", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "manager-a" });
        const response = await PATCH(
            new Request("http://localhost/api/school/commercial-orders/order-a", {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ action: "configure", teacherMembershipId: "teacher-a", classId: 42, participantMembershipIds: [] }),
            }),
            { params: Promise.resolve({ id: "order-a" }) },
        );

        expect(response.status).toBe(400);
        expect(mocks.configure).not.toHaveBeenCalled();
    });
});
