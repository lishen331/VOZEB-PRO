import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), relist: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/work-publication-service", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/server/work-publication-service")>()), relistOfficialWork: mocks.relist }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));
import { POST } from "./route";
const context = { params: Promise.resolve({ id: "work-one" }) };
describe("POST /api/admin/works/[id]/relist", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.relist.mockResolvedValue({ id: "work-one" });
    });
    it("re-lists official work and audits it", async () => {
        const response = await POST(new Request("http://localhost", { method: "POST" }), context);
        expect(response.status).toBe(200);
        expect(mocks.relist).toHaveBeenCalledWith("admin-one", "work-one");
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.official-work.relist" }));
    });
});
