import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    readJsonBodyResult: vi.fn(),
    writeback: vi.fn(),
    canvasProjectError: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBodyResult: mocks.readJsonBodyResult }));
vi.mock("@/lib/server/drama-lab-canvas-writeback-service", () => ({
    writebackDramaCanvasForUser: mocks.writeback,
    DramaCanvasWritebackError: class DramaCanvasWritebackError extends Error { constructor(message: string, readonly status: number) { super(message); } },
}));
vi.mock("@/lib/server/canvas-project-service", () => ({ canvasProjectError: mocks.canvasProjectError }));

import { POST } from "./route";

describe("drama canvas writeback route", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.readJsonBodyResult.mockResolvedValue({ ok: true, data: { projectId: "drama-one" } });
        mocks.writeback.mockResolvedValue({ project: { id: "drama-one" }, applied: { kind: "shot-field" } });
        mocks.canvasProjectError.mockReturnValue(null);
    });

    it("passes the canvas id and body to the scoped service", async () => {
        const response = await POST(new Request("http://localhost/api/drama-lab/canvas-projects/canvas-one/writeback", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "canvas-one" }) });
        expect(response.status).toBe(200);
        expect(mocks.writeback).toHaveBeenCalledWith("user-one", "canvas-one", { projectId: "drama-one" });
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { applied: { kind: "shot-field" } } });
    });

    it("returns authentication and validation failures without calling the service", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        expect((await POST(new Request("http://localhost"), { params: Promise.resolve({ id: "canvas-one" }) })).status).toBe(401);
        expect(mocks.writeback).not.toHaveBeenCalled();

        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.readJsonBodyResult.mockResolvedValue({ ok: false, status: 413, message: "too large" });
        const response = await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "canvas-one" }) });
        expect(response.status).toBe(413);
        expect(mocks.writeback).not.toHaveBeenCalled();
    });

    it("maps a service error to its status", async () => {
        mocks.writeback.mockRejectedValue(Object.assign(new Error("conflict"), { status: 409 }));
        mocks.canvasProjectError.mockImplementation((error: unknown) => (error as { status?: number }).status === 409 ? error : null);
        const response = await POST(new Request("http://localhost", { method: "POST" }), { params: Promise.resolve({ id: "canvas-one" }) });
        expect(response.status).toBe(409);
    });
});
