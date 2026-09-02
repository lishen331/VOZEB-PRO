import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    readJsonBody: vi.fn(),
    getDramaProject: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    updateDramaProject: vi.fn(),
    extractDramaLabStoryboards: vi.fn(),
    assertDramaLabStageAllowed: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/request", () => ({ readJsonBody: mocks.readJsonBody }));
vi.mock("@/lib/server/drama-project-store", () => ({
    DramaProjectStoreError: class DramaProjectStoreError extends Error {},
    getDramaProject: mocks.getDramaProject,
    updateDramaProject: mocks.updateDramaProject,
}));
vi.mock("@/lib/server/drama-lab-storyboard-extraction-service", () => ({
    DramaLabStoryboardExtractionError: class DramaLabStoryboardExtractionError extends Error {},
    extractDramaLabStoryboards: mocks.extractDramaLabStoryboards,
}));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
    assertDramaLabStageAllowed: mocks.assertDramaLabStageAllowed,
}));

import { POST } from "./route";

describe("POST /api/drama-lab/projects/:id/extract-storyboards", () => {
    it("replaces only the selected episode shots after extraction", async () => {
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async () => ({ project: await mocks.getDramaProject("project-one", "user-one"), ownerUserId: "user-one" }));
        const originalProject = {
            id: "project-one",
            title: "短剧",
            summary: "",
            style: "现代写实",
            ratio: "9:16",
            status: "active" as const,
            characters: [],
            scenes: [],
            props: [],
            clues: [],
            defaultVideoMode: "storyboard" as const,
            episodes: [
                { id: "episode-one", title: "第一集", script: "剧本", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft" as const, shots: [{ id: "old-shot" }] },
                { id: "episode-two", title: "第二集", script: "剧本", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft" as const, shots: [{ id: "other-shot" }] },
            ],
            createdAt: "2026-08-22T00:00:00.000Z",
            updatedAt: "2026-08-22T00:00:00.000Z",
        };
        const extractedShot = {
            id: "shot-new",
            order: 1,
            title: "新分镜",
            description: "新镜头描述",
            sourceText: "剧本文本",
            shotBoundary: "",
            dialogue: "",
            narration: "",
            utterances: [],
            imagePrompt: "",
            videoPrompt: "",
            cameraMotion: "",
            duration: 3,
            characterIds: [],
            propIds: [],
            clueIds: [],
        };
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.readJsonBody.mockResolvedValue({ episodeId: "episode-one", requestId: "request-one" });
        mocks.getDramaProject.mockResolvedValue(originalProject);
        mocks.extractDramaLabStoryboards.mockResolvedValue({ shots: [extractedShot], templateKeys: ["storyboard_system", "storyboard_output_format"] });

        const response = await POST(new Request("http://localhost/api/drama-lab/projects/project-one/extract-storyboards", { method: "POST" }), { params: Promise.resolve({ id: "project-one" }) });

        expect(response.status).toBe(200);
        expect(mocks.updateDramaProject).toHaveBeenCalledWith(
            "user-one",
            expect.objectContaining({
                episodes: [expect.objectContaining({ id: "episode-one", shots: [extractedShot] }), expect.objectContaining({ id: "episode-two", shots: [{ id: "other-shot" }] })],
            }),
            originalProject.updatedAt,
        );
        await expect(response.json()).resolves.toMatchObject({ code: 0, data: { shots: [{ id: "shot-new", episodeId: "episode-one", shotNumber: 1, script: "新镜头描述" }] } });
    });
});
