import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    resolveProject: vi.fn(),
    assertStage: vi.fn(),
    createTask: vi.fn(),
    getTask: vi.fn(),
    getByRequest: vi.fn(),
    updateTask: vi.fn(),
}));
vi.mock("@/lib/server/drama-project-service", () => ({ getDramaProjectForUser: vi.fn() }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    resolveDramaLabProjectForRequest: mocks.resolveProject,
    assertDramaLabStageAllowed: mocks.assertStage,
}));
vi.mock("@/lib/server/generation-task-store", () => ({
    createStoredGenerationTask: mocks.createTask,
    getStoredGenerationTask: mocks.getTask,
    getStoredGenerationTaskByRequest: mocks.getByRequest,
    updateStoredGenerationTask: mocks.updateTask,
}));

import { createDramaLabFinalVideoTask } from "./drama-lab-final-video-service";

function project() {
    return {
        id: "project-one",
        title: "测试",
        summary: "",
        style: "写实",
        ratio: "9:16",
        status: "active",
        defaultVideoMode: "storyboard",
        createdAt: "2026-09-01",
        updatedAt: "2026-09-11T00:00:00Z",
        characters: [],
        scenes: [],
        props: [],
        clues: [],
        activeEpisodeId: "episode-one",
        sourceAssets: [],
        episodes: [
            {
                id: "episode-one",
                episodeNumber: 1,
                title: "第1集",
                script: "",
                outline: "",
                hook: "",
                nextPreview: "",
                sourceRange: "",
                reviewStatus: "draft",
                shots: [
                    {
                        id: "shot-two",
                        order: 2,
                        title: "",
                        description: "",
                        sourceText: "",
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
                        videoUrl: "/video/two.mp4",
                        generationTaskId: "video-two",
                    },
                    {
                        id: "shot-one",
                        order: 1,
                        title: "",
                        description: "",
                        sourceText: "",
                        shotBoundary: "",
                        dialogue: "",
                        narration: "",
                        utterances: [],
                        imagePrompt: "",
                        videoPrompt: "",
                        cameraMotion: "",
                        duration: 2,
                        characterIds: [],
                        propIds: [],
                        clueIds: [],
                        videoUrl: "/video/one.mp4",
                        generationTaskId: "video-one",
                    },
                ],
            },
        ],
    };
}

describe("drama lab final video task snapshot", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.resolveProject.mockResolvedValue({ project: project(), ownerUserId: "owner-one" });
        mocks.assertStage.mockResolvedValue(undefined);
        mocks.createTask.mockImplementation(async (_type: string, task: unknown) => task);
        mocks.getByRequest.mockResolvedValue(null);
    });

    it("builds an immutable server snapshot in shot order without trusting client media", async () => {
        const task = await createDramaLabFinalVideoTask({ userId: "member-one", projectId: "project-one", episodeId: "episode-one", clientRequestId: "req-one" });
        expect(task.taskKind).toBe("drama_lab_final_video");
        expect(task.inputSnapshot.ownerUserId).toBe("owner-one");
        expect(task.inputSnapshot.shotIds).toEqual(["shot-one", "shot-two"]);
        expect(task.inputSnapshot.shots.map((shot) => shot.videoUrl)).toEqual(["/video/one.mp4", "/video/two.mp4"]);
        expect(task.inputSnapshot.inputHash).toMatch(/^[a-f0-9]{64}$/);
        expect(mocks.assertStage).toHaveBeenCalledWith("member-one", "project-one", "final_export", { episodeId: "episode-one", resourceType: "episode", resourceId: "episode-one" });
    });

    it("rejects a shot without a server-side video", async () => {
        const value = project();
        value.episodes[0].shots[1].videoUrl = "";
        mocks.resolveProject.mockResolvedValue({ project: value, ownerUserId: "owner-one" });
        await expect(createDramaLabFinalVideoTask({ userId: "member-one", projectId: "project-one", episodeId: "episode-one" })).rejects.toMatchObject({ status: 400, message: expect.stringContaining("shot-one") });
        expect(mocks.createTask).not.toHaveBeenCalled();
    });

    it("reuses an idempotent request before reading a new project snapshot", async () => {
        const existing = { id: "task-existing", taskKind: "drama_lab_final_video" };
        mocks.getByRequest.mockResolvedValue(existing);
        const result = await createDramaLabFinalVideoTask({ userId: "member-one", projectId: "project-one", episodeId: "episode-one", clientRequestId: "same-request" });
        expect(result).toBe(existing);
        expect(mocks.createTask).not.toHaveBeenCalled();
    });
});
