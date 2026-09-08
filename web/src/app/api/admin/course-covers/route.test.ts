import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), upload: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/course-cover-service", () => ({ uploadCourseCover: mocks.upload }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: () => ({}), safeRecordAuditLog: mocks.audit }));
import { PUT } from "./route";
beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "admin", role: "admin", status: "active", adminPermissions: ["education.manage"] });
});
it("requires a current education administrator", async () => {
    mocks.user.mockResolvedValueOnce(null).mockResolvedValueOnce({ role: "user", status: "active" });
    expect((await PUT(new Request("http://localhost"))).status).toBe(401);
    expect((await PUT(new Request("http://localhost"))).status).toBe(403);
    expect(mocks.upload).not.toHaveBeenCalled();
});
it("uploads local file bytes and audits the stable media key", async () => {
    mocks.upload.mockResolvedValue({ storageKey: "permanent/cover.webp", previewUrl: "/api/reference-assets/permanent/cover.webp" });
    const response = await PUT(new Request("http://localhost", { method: "PUT", body: new Uint8Array([1, 2, 3]) }));
    expect(response.status).toBe(200);
    expect(mocks.upload).toHaveBeenCalledWith("admin", new Uint8Array([1, 2, 3]));
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.course.cover.upload" }));
});
it("rejects oversized requests before upload", async () => {
    expect((await PUT(new Request("http://localhost", { method: "PUT", headers: { "content-length": String(20 * 1024 * 1024 + 1) }, body: "x" }))).status).toBe(413);
    expect(mocks.upload).not.toHaveBeenCalled();
});
