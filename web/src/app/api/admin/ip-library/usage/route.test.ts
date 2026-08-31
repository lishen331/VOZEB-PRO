import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-admin-service", () => ({ listAdminIpUsage: mocks.list }));

import { GET } from "./route";

describe("admin IP download records route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    });

    it("rejects unsupported download filters before querying", async () => {
        expect((await GET(new Request("http://localhost/api/admin/ip-library/usage?downloadType=reference"))).status).toBe(400);
        expect((await GET(new Request("http://localhost/api/admin/ip-library/usage?result=unknown"))).status).toBe(400);
        expect(mocks.list).not.toHaveBeenCalled();
    });

    it("passes bounded download filters to the service", async () => {
        const response = await GET(new Request("http://localhost/api/admin/ip-library/usage?page=2&pageSize=12&downloadType=package&result=failed"));
        expect(response.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("admin-a", expect.objectContaining({ page: 2, pageSize: 12, downloadType: "package", result: "failed" }));
    });
});
