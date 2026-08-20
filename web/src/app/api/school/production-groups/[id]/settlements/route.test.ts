import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn(), confirm: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-compute-settlement-service", () => ({ listGroupSettlements: mocks.list, confirmConsumedAdvanceReturns: mocks.confirm }));

import { GET } from "./route";
import { POST as POSTConfirm } from "./[settlementId]/confirm/route";

describe("school compute settlements routes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "manager-a" });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 2, pageSize: 10 });
        mocks.confirm.mockResolvedValue({ id: "settlement-a", status: "completed" });
    });

    it("lists the current school group settlements", async () => {
        const response = await GET(new Request("http://localhost/api/school/production-groups/group-a/settlements?schoolId=school-b&page=2&pageSize=10"), { params: Promise.resolve({ id: "group-a" }) });
        expect(response.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("manager-a", "group-a", { page: 2, pageSize: 10 });
    });

    it("confirms an explicit subset of advances", async () => {
        const request = new Request("http://localhost/api/school/production-groups/group-a/settlements/settlement-a/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ advanceIds: ["advance-a"] }) });
        expect((await POSTConfirm(request, { params: Promise.resolve({ id: "group-a", settlementId: "settlement-a" }) })).status).toBe(200);
        expect(mocks.confirm).toHaveBeenCalledWith("manager-a", "group-a", "settlement-a", { advanceIds: ["advance-a"] });
    });

    it("rejects malformed advance identifiers", async () => {
        const request = new Request("http://localhost/api/school/production-groups/group-a/settlements/settlement-a/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ advanceIds: [1] }) });
        expect((await POSTConfirm(request, { params: Promise.resolve({ id: "group-a", settlementId: "settlement-a" }) })).status).toBe(400);
        expect(mocks.confirm).not.toHaveBeenCalled();
    });
});
