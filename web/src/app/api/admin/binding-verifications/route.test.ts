import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), start: vi.fn(), advance: vi.fn(), get: vi.fn(), after: vi.fn() }));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/server")>()), after: mocks.after }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/binding-verification-runner", () => ({
    startBindingVerification: mocks.start,
    advanceBindingVerification: mocks.advance,
    publicBindingVerification: (run: { id: string; status: string; phase: string }) => ({ id: run.id, status: run.status, phase: run.phase }),
}));
vi.mock("@/lib/server/binding-verification-store", () => ({ getBindingVerification: mocks.get }));
vi.mock("@/lib/server/public-request-origin", () => ({ resolvePublicRequestOrigin: () => "https://site.test" }));
import { POST } from "./route";
import { GET } from "./[id]/route";
const admin = { id: "u", role: "admin", status: "active", adminPermissions: ["upstream.manage"] };
const request = () => new Request("https://site.test/api/admin/binding-verifications", { method: "POST", headers: { "content-type": "application/json", cookie: "session=secret" }, body: JSON.stringify({ logicalModelId: "m", bindingId: "b" }) });
describe("admin binding verification API", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.mockResolvedValue(admin);
        mocks.start.mockResolvedValue({ id: "run", status: "running", phase: "queued", token: "secret" });
        mocks.get.mockResolvedValue({ id: "run", userId: "u", status: "running", phase: "queued" });
        mocks.advance.mockResolvedValue({ id: "run", status: "passed", phase: "completed" });
    });
    it("requires login", async () => {
        mocks.user.mockResolvedValue(null);
        expect((await POST(request())).status).toBe(401);
        expect(mocks.start).not.toHaveBeenCalled();
    });
    it("requires upstream.manage rather than arbitrary admin role", async () => {
        mocks.user.mockResolvedValue({ ...admin, adminPermissions: ["users.read"] });
        expect((await POST(request())).status).toBe(403);
        expect(mocks.start).not.toHaveBeenCalled();
    });
    it("returns a safe accepted run and forwards session only to the scoped job", async () => {
        const response = await POST(request());
        expect(response.status).toBe(202);
        expect(await response.json()).toEqual({ test: { id: "run", status: "running", phase: "queued" } });
        expect(mocks.start).toHaveBeenCalledWith(expect.objectContaining({ logicalModelId: "m", bindingId: "b", user: admin }));
        await mocks.after.mock.calls[0][0]();
        expect(mocks.advance).toHaveBeenCalledWith("run", admin, "https://site.test", "session=secret");
    });
    it("never executes another admin's run", async () => {
        mocks.get.mockResolvedValue({ id: "run", userId: "other" });
        expect((await GET(new Request("https://site.test/api/admin/binding-verifications/run"), { params: Promise.resolve({ id: "run" }) })).status).toBe(404);
        expect(mocks.advance).not.toHaveBeenCalled();
    });
    it("queries only the authenticated owner's run", async () => {
        const response = await GET(new Request("https://site.test/api/admin/binding-verifications/run", { headers: { cookie: "session=secret" } }), { params: Promise.resolve({ id: "run" }) });
        expect(response.status).toBe(200);
        expect(mocks.advance).toHaveBeenCalledWith("run", admin, "https://site.test", "session=secret");
    });
});
