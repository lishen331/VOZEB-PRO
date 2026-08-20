import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), get: vi.fn(), listLedger: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/school-compute-service", () => ({ getCurrentSchoolComputePool: mocks.get, listCurrentSchoolComputeLedger: mocks.listLedger }));

import { GET } from "./route";
import { GET as GETLedger } from "./ledger/route";

describe("current school compute route", () => {
    beforeEach(() => vi.clearAllMocks());

    it("requires login", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        expect((await GET()).status).toBe(401);
    });

    it("uses the current member identity instead of a school id supplied by the client", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "student-a", role: "user", status: "active" });
        mocks.get.mockResolvedValue({ schoolId: "school-a", totalPoints: 10, availablePoints: 10, allocatedPoints: 0, consumedPoints: 0, status: "active" });
        const response = await GET();
        expect(response.status).toBe(200);
        expect(mocks.get).toHaveBeenCalledWith("student-a");
    });

    it("caps the current school ledger page size at one hundred", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "student-a", role: "user", status: "active" });
        mocks.listLedger.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 100 });
        await GETLedger(new Request("http://localhost/api/school/compute/ledger?pageSize=999"));
        expect(mocks.listLedger).toHaveBeenCalledWith("student-a", expect.objectContaining({ pageSize: 100 }));
    });
});
