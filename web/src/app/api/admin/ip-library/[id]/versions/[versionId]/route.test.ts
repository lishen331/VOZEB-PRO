import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), update: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-admin-service", () => ({ updateAdminIpVersion: mocks.update }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-a" })), safeRecordAuditLog: mocks.audit }));

import { PATCH } from "./route";

const context = { params: Promise.resolve({ id: "ip-a", versionId: "version-a" }) };

describe("admin IP draft version route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-a", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.update.mockResolvedValue({ id: "version-a", versionNumber: 2, status: "draft", items: [{ id: "item-a", fileId: "file-a" }] });
    });

    it("atomically updates a draft without placing file ids in audit metadata", async () => {
        const response = await PATCH(jsonRequest({ title: "第二版", items: [{ kind: "text", category: "script", title: "剧本", fileId: "file-a" }] }), context);
        expect(response.status).toBe(200);
        expect(mocks.update).toHaveBeenCalledWith("admin-a", "ip-a", "version-a", expect.objectContaining({ title: "第二版" }));
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.ip.version.update", target: { type: "ip_version", id: "version-a" } }));
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("file-a");
    });

    it("rejects missing permissions and malformed bodies", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce({ id: "admin-b", role: "admin", status: "active", adminPermissions: ["education.manage"] });
        expect((await PATCH(jsonRequest({ title: "越权", items: [] }), context)).status).toBe(403);
        expect((await PATCH(jsonRequest(null), context)).status).toBe(400);
    });
});

function jsonRequest(body: unknown) {
    return new Request("http://localhost/api/admin/ip-library/ip-a/versions/version-a", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}
