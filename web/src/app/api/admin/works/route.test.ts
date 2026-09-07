import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), list: vi.fn(), create: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/work-publication-service", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/server/work-publication-service")>()), listWorkPublicationsForAdmin: mocks.list, createOfficialWorkDraft: mocks.create }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));

import { GET, POST } from "./route";

describe("/api/admin/works official publishing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
        mocks.create.mockResolvedValue({ id: "work-one", publicationOrigin: "official" });
    });

    it("filters lists by origin", async () => {
        await GET(new Request("http://localhost/api/admin/works?origin=official") as never);
        expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ origin: "official" }));
    });

    it("creates official work with the session administrator and returns 201", async () => {
        const response = await POST(
            new Request("http://localhost/api/admin/works", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "官方案例", ownerUserId: "spoofed", publicationOrigin: "user_submission" }) }),
        );
        expect(response.status).toBe(201);
        expect(mocks.create).toHaveBeenCalledWith("admin-one", expect.objectContaining({ title: "官方案例" }));
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.official-work.create" }));
    });
});
