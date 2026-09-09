import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), recover: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/server/canvas-agent-recovery-service", () => ({ recoverCanvasProjectForUser: mocks.recover }));
import { POST } from "./route";
const context = { params: Promise.resolve({ id: "canvas" }) };
describe("explicit Canvas result recovery", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.user.mockResolvedValue({ id: "owner" });
        mocks.recover.mockResolvedValue({ id: "canvas", nodes: [], updatedAt: "now" });
    });
    it("requires login before accessing project recovery", async () => {
        mocks.user.mockResolvedValue(null);
        expect((await POST(new Request("http://localhost/api/canvas/projects/canvas/recover-agent-results", { method: "POST" }), context)).status).toBe(401);
        expect(mocks.recover).not.toHaveBeenCalled();
    });
    it("never accepts an owner identity supplied by the caller", async () => {
        const r = await POST(new Request("http://localhost/api/canvas/projects/canvas/recover-agent-results?userId=other", { method: "POST" }), context);
        expect(r.status).toBe(200);
        expect(mocks.recover).toHaveBeenCalledWith("owner", "canvas");
        expect(await r.json()).toMatchObject({ code: 0, data: { project: { id: "canvas" } } });
    });
    it("returns not found for missing, other-owner or drama canvases", async () => {
        mocks.recover.mockResolvedValue(null);
        expect((await POST(new Request("http://localhost/recover", { method: "POST" }), context)).status).toBe(404);
    });
    it("does not convert persistence failure into a successful response", async () => {
        mocks.recover.mockRejectedValue(new Error("db unavailable"));
        await expect(POST(new Request("http://localhost/recover", { method: "POST" }), context)).rejects.toThrow("db unavailable");
    });
});
