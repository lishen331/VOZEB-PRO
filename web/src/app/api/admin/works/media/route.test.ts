import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), upload: vi.fn(), list: vi.fn(), remove: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/official-work-media-service", () => ({ uploadOfficialWorkMedia: mocks.upload, listOfficialWorkMedia: mocks.list, deleteOfficialWorkMedia: mocks.remove }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));

import { DELETE, GET, POST } from "./route";

describe("/api/admin/works/media", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
        mocks.upload.mockResolvedValue({ storageKey: "permanent/cover.png" });
        mocks.remove.mockResolvedValue({ deletedFiles: 1, blocked: [] });
    });

    it("requires login and content management permission", async () => {
        mocks.user.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "admin-two", role: "admin", status: "active", adminPermissions: [] });
        expect((await GET(request())).status).toBe(401);
        expect((await GET(request())).status).toBe(403);
    });

    it("passes the session administrator to list, upload, and delete services", async () => {
        const listResponse = await GET(request("?page=2&pageSize=10&type=image&keyword=cover"));
        expect(listResponse.status).toBe(200);
        expect(mocks.list).toHaveBeenCalledWith("admin-one", { page: 2, pageSize: 10, type: "image", keyword: "cover" });

        const form = new FormData();
        form.set("file", new File(["png"], "cover.png", { type: "image/png" }));
        expect((await POST(new Request("http://localhost/api/admin/works/media", { method: "POST", body: form }))).status).toBe(201);
        expect(mocks.upload).toHaveBeenCalledWith("admin-one", expect.any(File));
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.official-work.media.upload" }));

        const deleteResponse = await DELETE(new Request("http://localhost/api/admin/works/media", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ storageKeys: ["permanent/cover.png"] }) }));
        expect(deleteResponse.status).toBe(200);
        expect(mocks.remove).toHaveBeenCalledWith("admin-one", ["permanent/cover.png"]);
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.official-work.media.delete" }));
    });
});

function request(search = "") {
    return new Request(`http://localhost/api/admin/works/media${search}`);
}
