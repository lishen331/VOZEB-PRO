import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), getIpDetailForUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-service", () => ({ getIpDetailForUser: mocks.getIpDetailForUser }));

import { GET } from "./route";

describe("GET /api/ip-library/:id", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.getIpDetailForUser.mockResolvedValue({ id: "ip-one", subIps: [{ id: "child-one" }] });
    });

    it("reads a requested child IP through the service", async () => {
        const response = await GET(new Request("http://localhost/api/ip-library/ip-one?subIpId=child-one"), { params: Promise.resolve({ id: "ip-one" }) });
        expect(response.status).toBe(200);
        expect(mocks.getIpDetailForUser).toHaveBeenCalledWith("user-one", "ip-one", "child-one");
        expect(await response.json()).toMatchObject({ code: 0, data: { id: "ip-one" } });
    });

    it("returns 404 for a revoked or cross-school IP without leaking details", async () => {
        mocks.getIpDetailForUser.mockRejectedValue(Object.assign(new Error("IP 不存在或无权访问"), { status: 404 }));
        const response = await GET(new Request("http://localhost/api/ip-library/ip-one"), { params: Promise.resolve({ id: "ip-one" }) });
        expect(response.status).toBe(404);
        expect(await response.json()).toMatchObject({ code: 404, data: null });
    });
});
