import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    readJsonBodyResult: vi.fn(),
    resolveEpisodeCanvas: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBodyResult: mocks.readJsonBodyResult }));
vi.mock("@/lib/server/drama-lab-episode-canvas-service", () => ({
    DramaLabEpisodeCanvasServiceError: class DramaLabEpisodeCanvasServiceError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    },
    getOrCreateDramaLabEpisodeCanvasForUser: mocks.resolveEpisodeCanvas,
}));
vi.mock("@/lib/server/canvas-project-service", () => ({ canvasProjectError: vi.fn(() => null) }));

import { DramaLabEpisodeCanvasServiceError } from "@/lib/server/drama-lab-episode-canvas-service";
import { POST } from "./route";

describe("POST /api/drama-lab/projects/:id/episode-canvas", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.readJsonBodyResult.mockResolvedValue({ ok: true, data: { episodeId: "episode-one" } });
        mocks.resolveEpisodeCanvas.mockResolvedValue({ project: { id: "canvas-one", sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one" } });
    });

    it("resolves the owned episode canvas and returns its stable id", async () => {
        const response = await POST(new Request("http://localhost/api/drama-lab/projects/drama-one/episode-canvas", { method: "POST" }), { params: Promise.resolve({ id: "drama-one" }) });

        expect(mocks.resolveEpisodeCanvas).toHaveBeenCalledWith("user-one", "drama-one", "episode-one");
        expect(response.status).toBe(200);
        await expect(response.json()).resolves.toEqual({ code: 0, data: { canvasId: "canvas-one", project: { id: "canvas-one", sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one" } }, msg: "OK" });
    });

    it("forwards a requested shot id for ownership validation and initial focus", async () => {
        mocks.readJsonBodyResult.mockResolvedValueOnce({ ok: true, data: { episodeId: "episode-one", shotId: "shot-one" } });

        const response = await POST(new Request("http://localhost/api/drama-lab/projects/drama-one/episode-canvas", { method: "POST" }), { params: Promise.resolve({ id: "drama-one" }) });

        expect(response.status).toBe(200);
        expect(mocks.resolveEpisodeCanvas).toHaveBeenCalledWith("user-one", "drama-one", "episode-one", "shot-one");
    });

    it("rejects unauthenticated and malformed requests before resolving a canvas", async () => {
        mocks.getCurrentUser.mockResolvedValueOnce(null);
        const unauthorized = await POST(new Request("http://localhost/api/drama-lab/projects/drama-one/episode-canvas", { method: "POST" }), { params: Promise.resolve({ id: "drama-one" }) });
        expect(unauthorized.status).toBe(401);

        mocks.readJsonBodyResult.mockResolvedValueOnce({ ok: false, status: 400, message: "请求体无效" });
        const malformed = await POST(new Request("http://localhost/api/drama-lab/projects/drama-one/episode-canvas", { method: "POST" }), { params: Promise.resolve({ id: "drama-one" }) });
        expect(malformed.status).toBe(400);
        expect(mocks.resolveEpisodeCanvas).not.toHaveBeenCalled();
    });

    it("preserves ownership and episode validation status codes", async () => {
        mocks.resolveEpisodeCanvas.mockRejectedValueOnce(new DramaLabEpisodeCanvasServiceError("剧集不存在或不属于当前短剧项目", 404));

        const response = await POST(new Request("http://localhost/api/drama-lab/projects/drama-one/episode-canvas", { method: "POST" }), { params: Promise.resolve({ id: "drama-one" }) });

        expect(response.status).toBe(404);
        await expect(response.json()).resolves.toMatchObject({ code: 404, msg: "剧集不存在或不属于当前短剧项目" });
    });
});
