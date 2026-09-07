import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn(), create: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-admin-service", () => ({ listAdminIps: mocks.list, createAdminIp: mocks.create }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-a" })), safeRecordAuditLog: mocks.audit }));

import { GET, POST } from "./route";

describe("admin IP library route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
        mocks.create.mockResolvedValue({ id: "ip-a", title: "星海", visibility: "school", status: "enabled" });
    });

    it("allows either IP duty to read but only content duty to create", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce({ id: "education-a", role: "admin", status: "active", adminPermissions: ["education.manage"] });
        expect((await GET(new Request("http://localhost/api/admin/ip-library?page=1"))).status).toBe(200);
        mocks.getCurrentUser.mockResolvedValueOnce({ id: "education-a", role: "admin", status: "active", adminPermissions: ["education.manage"] });
        expect((await POST(jsonRequest({ title: "星海" }))).status).toBe(403);
    });

    it("rejects null JSON and audits stable create metadata only", async () => {
        expect((await POST(jsonRequest(null))).status).toBe(400);
        const response = await POST(jsonRequest({ title: "星海", slug: "star-sea", summary: "敏感正文", visibility: "school" }));
        expect(response.status).toBe(200);
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.ip.create", target: { type: "ip", id: "ip-a", label: "星海" }, metadata: { status: "enabled", visibility: "school" } }));
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("敏感正文");
    });
});

function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/admin/ip-library", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
