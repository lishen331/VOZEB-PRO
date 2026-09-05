import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), read: vi.fn(), remove: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-admin-service", () => ({ readAdminIpFile: mocks.read, deleteAdminIpFile: mocks.remove }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-one" })), safeRecordAuditLog: mocks.audit }));

import { DELETE, GET } from "./route";

const context = { params: Promise.resolve({ id: "ip-one", fileId: "file-one" }) };

describe("admin IP content file route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.read.mockResolvedValue(new Response("正文", { headers: { "content-type": "text/plain" } }));
        mocks.remove.mockResolvedValue(undefined);
    });

    it("returns a controlled file response", async () => {
        const response = await GET(new Request("http://localhost/api/admin/ip-library/ip-one/files/file-one"), context);
        expect(response.status).toBe(200);
        expect(await response.text()).toBe("正文");
        expect(mocks.read).toHaveBeenCalledWith("admin-one", expect.any(Request), "ip-one", "file-one");
    });

    it("deletes orphan files and audits identifiers only", async () => {
        const request = new Request("http://localhost/api/admin/ip-library/ip-one/files/file-one", { method: "DELETE" });
        const response = await DELETE(request, context);
        expect(await response.json()).toMatchObject({ code: 0, data: { deleted: true } });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.ip.file.delete", target: { type: "ip_file", id: "file-one" }, metadata: { ipId: "ip-one" } }));
    });
});
