import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), listIpLibraryForUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-service", () => ({ listIpLibraryForUser: mocks.listIpLibraryForUser }));

import { GET } from "./route";

describe("GET /api/ip-library", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.listIpLibraryForUser.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it("requires a signed-in user", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await GET(new Request("http://localhost/api/ip-library?scope=public"));
        expect(response.status).toBe(401);
        expect(await response.json()).toMatchObject({ code: 401, data: null });
        expect(mocks.listIpLibraryForUser).not.toHaveBeenCalled();
    });

    it("passes only allowlisted filters and the server-owned scope", async () => {
        const response = await GET(new Request("http://localhost/api/ip-library?scope=school&page=2&pageSize=12&keyword=%E6%98%9F&kind=image&category=character"));
        expect(response.status).toBe(200);
        expect(mocks.listIpLibraryForUser).toHaveBeenCalledWith("user-one", { scope: "school", page: 2, pageSize: 12, keyword: "星", kind: "image", category: "character" });
    });

    it("maps service access failures to the shared response shape", async () => {
        mocks.listIpLibraryForUser.mockRejectedValue(Object.assign(new Error("没有学校身份"), { status: 403 }));
        const response = await GET(new Request("http://localhost/api/ip-library?scope=school"));
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 403, data: null, msg: "没有学校身份" });
    });

    it("rejects unknown content filters before calling the service", async () => {
        const response = await GET(new Request("http://localhost/api/ip-library?scope=public&kind=document"));
        expect(response.status).toBe(400);
        expect(mocks.listIpLibraryForUser).not.toHaveBeenCalled();
    });
});
