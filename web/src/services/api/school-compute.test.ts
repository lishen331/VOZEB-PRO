import { beforeEach, describe, expect, it, vi } from "vitest";
import { schoolComputeApi } from "./school-compute";

describe("school compute API", () => {
    beforeEach(() => vi.restoreAllMocks());
    it("serializes group filters and unwraps the shared envelope", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ code: 0, data: { items: [], total: 0, page: 2, pageSize: 10 }, msg: "ok" }), { status: 200 }));
        await schoolComputeApi.listGroups({ page: 2, pageSize: 10, keyword: "短剧", status: "active" });
        expect(fetchMock).toHaveBeenCalledWith("/api/school/production-groups?page=2&pageSize=10&keyword=%E7%9F%AD%E5%89%A7&status=active", expect.objectContaining({ cache: "no-store" }));
    });

    it("submits a stable allocation idempotency key", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { id: "group-a" }, msg: "ok" }), { status: 200 }));
        const input = { amount: 12.5, reason: "补充分镜算力", orderId: "order-a", idempotencyKey: "allocation-a" };
        await schoolComputeApi.allocate("group-a", input);
        expect(fetchMock).toHaveBeenCalledWith("/api/school/production-groups/group-a/allocate", expect.objectContaining({ method: "POST", body: JSON.stringify(input) }));
    });

    it("submits a decimal personal advance and lists only the current member records", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ code: 0, data: { items: [], total: 0, page: 2, pageSize: 10 }, msg: "ok" }), { status: 200 }));
        const input = { orderId: "order-a", amount: 12.5, idempotencyKey: "advance-a" };
        await schoolComputeApi.createPersonalAdvance("group/a", input);
        expect(fetchMock).toHaveBeenLastCalledWith("/api/teaching/production-groups/group%2Fa/personal-advances", expect.objectContaining({ method: "POST", body: JSON.stringify(input) }));
        await schoolComputeApi.listOwnAdvances("group/a", { page: 2, pageSize: 10 });
        expect(fetchMock).toHaveBeenLastCalledWith("/api/teaching/production-groups/group%2Fa/personal-advances?page=2&pageSize=10", expect.objectContaining({ cache: "no-store" }));
    });

    it("lists settlements and confirms selected consumed advances", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ code: 0, data: { items: [], total: 0, page: 1, pageSize: 20 }, msg: "ok" }), { status: 200 }));
        await schoolComputeApi.listSettlements("group/a", { page: 1, pageSize: 20 });
        expect(fetchMock).toHaveBeenLastCalledWith("/api/school/production-groups/group%2Fa/settlements?page=1&pageSize=20", expect.objectContaining({ cache: "no-store" }));
        await schoolComputeApi.confirmSettlement("group/a", "settlement/a", { advanceIds: ["advance-a"] });
        expect(fetchMock).toHaveBeenLastCalledWith("/api/school/production-groups/group%2Fa/settlements/settlement%2Fa/confirm", expect.objectContaining({ method: "POST", body: JSON.stringify({ advanceIds: ["advance-a"] }) }));
    });
});
