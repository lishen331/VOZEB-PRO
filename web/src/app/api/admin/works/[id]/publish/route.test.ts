import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), publish: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/work-publication-service", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/server/work-publication-service")>()), publishOfficialWork: mocks.publish }));
vi.mock("@/lib/server/audit-log-store", () => ({ auditActorFromRequest: vi.fn(() => ({})), safeRecordAuditLog: mocks.audit }));
import { POST } from "./route";
const context = { params: Promise.resolve({ id: "work-one" }) };
describe("POST /api/admin/works/[id]/publish", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.mockResolvedValue({ id: "admin-one", role: "admin", status: "active", adminPermissions: ["content.manage"] });
        mocks.publish.mockResolvedValue({ id: "work-one", publicPath: "/share/official" });
    });
    it("publishes a specified version as the session administrator", async () => {
        const response = await POST(new Request("http://localhost", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ versionId: "version-one" }) }), context);
        expect(response.status).toBe(200);
        expect(mocks.publish).toHaveBeenCalledWith({ adminUserId: "admin-one", workId: "work-one", versionId: "version-one" });
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.official-work.publish" }));
    });
});
