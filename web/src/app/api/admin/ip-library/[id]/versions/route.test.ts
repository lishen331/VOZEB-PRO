import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn(), create: vi.fn(), publish: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-admin-service", () => ({ listAdminIpVersions: mocks.list, createAdminIpVersion: mocks.create, publishAdminIpVersion: mocks.publish }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-a" })), safeRecordAuditLog: mocks.audit }));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ id: "ip-a" }) };

describe("admin IP versions route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
        mocks.create.mockResolvedValue({ id: "version-a", versionNumber: 2, status: "draft", items: [{ id: "item-a" }] });
        mocks.publish.mockResolvedValue({ id: "version-a", versionNumber: 2, status: "published", items: [{ id: "item-a" }] });
    });

    it("lists versions for either duty and creates drafts for content duty", async () => {
        expect((await GET(new Request("http://localhost/api/admin/ip-library/ip-a/versions"), context)).status).toBe(200);
        const response = await POST(jsonRequest({ action: "create", title: "第二版", items: [{ kind: "text", category: "script", title: "剧本", textContent: "正文不进审计" }] }), context);
        expect(response.status).toBe(200);
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.ip.version.create", target: { type: "ip_version", id: "version-a" }, metadata: { ipId: "ip-a", versionNumber: 2, status: "draft" } }));
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("正文不进审计");
    });

    it("publishes by explicit action and rejects malformed bodies", async () => {
        expect((await POST(jsonRequest({ action: "publish", versionId: "version-a" }), context)).status).toBe(200);
        expect(mocks.publish).toHaveBeenCalledWith("admin-a", "ip-a", "version-a");
        expect((await POST(jsonRequest(null), context)).status).toBe(400);
    });
});

function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/admin/ip-library/ip-a/versions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
