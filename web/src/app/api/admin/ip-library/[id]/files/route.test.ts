import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), list: vi.fn(), upload: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-admin-service", () => ({ listAdminIpFiles: mocks.list, uploadAdminIpFile: mocks.upload }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({ id: "admin-one" })), safeRecordAuditLog: mocks.audit }));

import { GET, POST } from "./route";

const context = { params: Promise.resolve({ id: "ip-one" }) };

describe("admin IP content files route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.list.mockResolvedValue([{ id: "file-one", ipId: "ip-one", kind: "text", status: "ready" }]);
        mocks.upload.mockResolvedValue({ id: "file-one", ipId: "ip-one", kind: "text", originalName: "story.txt", status: "ready", storageKey: "private/key" });
    });

    it("lists files and uploads multipart content for content managers", async () => {
        const listResponse = await GET(new Request("http://localhost/api/admin/ip-library/ip-one/files"), context);
        expect(await listResponse.json()).toMatchObject({ code: 0, data: [{ id: "file-one" }] });

        const form = new FormData();
        form.set("kind", "text");
        form.set("file", new File(["正文"], "story.txt", { type: "text/plain" }));
        const uploadResponse = await POST(new Request("http://localhost/api/admin/ip-library/ip-one/files", { method: "POST", body: form }), context);
        expect(uploadResponse.status).toBe(200);
        expect(mocks.upload).toHaveBeenCalledWith("admin-one", "ip-one", "text", expect.any(File));
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.ip.file.upload", target: { type: "ip_file", id: "file-one" }, metadata: { ipId: "ip-one", kind: "text", status: "ready" } }));
        expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("private/key");
    });

    it("rejects missing content duty before reading uploads", async () => {
        mocks.getCurrentUser.mockResolvedValue({ id: "education-one", role: "admin", status: "active", adminPermissions: ["education.manage"] });
        const response = await POST(new Request("http://localhost/api/admin/ip-library/ip-one/files", { method: "POST", body: new FormData() }), context);
        expect(response.status).toBe(403);
        expect(mocks.upload).not.toHaveBeenCalled();
    });
});
