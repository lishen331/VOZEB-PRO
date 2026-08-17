import { afterEach, describe, expect, it, vi } from "vitest";

import { commercialOrdersApi } from "./commercial-orders";

describe("commercial orders api", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("uses the admin, school and teaching route families", async () => {
        const fetchMock = vi.fn(async () => Response.json({ code: 0, data: { items: [], total: 0, page: 1, pageSize: 20 }, msg: "ok" }));
        vi.stubGlobal("fetch", fetchMock);

        await commercialOrdersApi.listPlatformCommercialOrders({ page: 1, status: "draft" });
        await commercialOrdersApi.getPlatformCommercialOrder("order-a", { page: 2, pageSize: 10 });
        await commercialOrdersApi.listSchoolCommercialOrders({ page: 2 });
        await commercialOrdersApi.listTeachingCommercialOrders({ page: 3 });
        await commercialOrdersApi.listCommercialOrderSubmissions("order-a", { page: 4, pageSize: 5 });
        await commercialOrdersApi.listCommercialOrderParticipantCandidates("order-a", { page: 1, pageSize: 12, keyword: "0007" });

        const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>;
        expect(calls.map(([url]) => url)).toEqual([
            "/api/admin/commercial-orders?page=1&status=draft",
            "/api/admin/commercial-orders/order-a?page=2&pageSize=10",
            "/api/school/commercial-orders?page=2",
            "/api/teaching/commercial-orders?page=3",
            "/api/teaching/commercial-orders/order-a/submissions?page=4&pageSize=5",
            "/api/teaching/commercial-orders/order-a/participants?page=1&pageSize=12&keyword=0007",
        ]);
    });

    it("sends explicit workflow actions and stable content references", async () => {
        const fetchMock = vi.fn(async () => Response.json({ code: 0, data: { id: "order-a" }, msg: "ok" }));
        vi.stubGlobal("fetch", fetchMock);

        await commercialOrdersApi.assignCommercialOrder("order-a", "school-a");
        await commercialOrdersApi.configureCommercialOrder("order-a", { teacherMembershipId: "teacher-a", classId: "class-a", participantMembershipIds: ["student-a"] });
        await commercialOrdersApi.configureCommercialOrderParticipants("order-a", ["student-a"]);
        await commercialOrdersApi.startCommercialOrder("order-a");
        await commercialOrdersApi.submitCommercialOrderWork("order-a", { note: "候选", references: [{ type: "asset", id: "asset-a" }] });
        await commercialOrdersApi.submitCommercialOrderDelivery("order-a", { note: "交付", references: [{ type: "generation", id: "generation-a" }] });
        await commercialOrdersApi.reviewCommercialOrder("order-a", { decision: "revision_required", feedback: "补充片尾" });

        const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit | undefined]>;
        expect(JSON.parse(String(calls[0]?.[1]?.body))).toEqual({ action: "assign", schoolId: "school-a" });
        expect(JSON.parse(String(calls[1]?.[1]?.body))).toEqual({ action: "configure", teacherMembershipId: "teacher-a", classId: "class-a", participantMembershipIds: ["student-a"] });
        expect(JSON.parse(String(calls[2]?.[1]?.body))).toEqual({ action: "participants", participantMembershipIds: ["student-a"] });
        expect(JSON.parse(String(calls[3]?.[1]?.body))).toEqual({ action: "start" });
        expect(JSON.parse(String(calls[4]?.[1]?.body))).toEqual({ action: "candidate", note: "候选", references: [{ type: "asset", id: "asset-a" }] });
        expect(JSON.parse(String(calls[5]?.[1]?.body))).toEqual({ action: "delivery", note: "交付", references: [{ type: "generation", id: "generation-a" }] });
        expect(calls[6]?.[0]).toBe("/api/admin/commercial-orders/order-a/review");
    });
});
