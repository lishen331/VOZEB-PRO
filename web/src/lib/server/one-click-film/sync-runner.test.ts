import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({ getImageTask: vi.fn(), getVideoTask: vi.fn(), persist: vi.fn() }));
vi.mock("@/lib/server/image-task-store", () => ({ getImageTask: mocks.getImageTask }));
vi.mock("@/lib/server/video-task-store", () => ({ getVideoTask: mocks.getVideoTask }));
vi.mock("@/lib/server/drama-lab-shot-generation-service", async () => {
    const actual = await vi.importActual<typeof import("@/lib/server/drama-lab-shot-generation-service")>("@/lib/server/drama-lab-shot-generation-service");
    return { ...actual, persistDramaLabShotUpdate: mocks.persist };
});

import { syncOneClickShotGeneration } from "./sync-runner";

function shot(extra: Partial<DramaShot> = {}): DramaShot {
    return {
        id: "s1",
        order: 1,
        title: "镜头1",
        description: "",
        sourceText: "",
        shotBoundary: "",
        dialogue: "",
        narration: "",
        utterances: [],
        imagePrompt: "图片提示词",
        videoPrompt: "视频提示词",
        cameraMotion: "",
        duration: 3,
        characterIds: [],
        propIds: [],
        clueIds: [],
        ...extra,
    };
}

function project(s: DramaShot): DramaProject {
    return { id: "p1", episodes: [{ id: "e1", shots: [s] }] } as unknown as DramaProject;
}

const call = (s: DramaShot) => syncOneClickShotGeneration({ userId: "u1", project: project(s), episodeId: "e1", shotId: "s1" });

beforeEach(() => {
    vi.clearAllMocks();
    // persist 返回"已应用 patch"的项目快照，便于断言回写结果
    mocks.persist.mockImplementation(async (input: { project: DramaProject; patch: Partial<DramaShot> }) => ({
        ...input.project,
        episodes: input.project.episodes.map((e) => ({ ...e, shots: e.shots.map((item) => (item.id === "s1" ? { ...item, ...input.patch } : item)) })),
    }));
});

describe("one-click-film sync runner", () => {
    it("does nothing when the shot has no bound tasks", async () => {
        const result = await call(shot());
        expect(result.changed).toBe(false);
        expect(mocks.persist).not.toHaveBeenCalled();
    });

    it("writes back an image using serverUrl before remoteUrl and dataUrl", async () => {
        mocks.getImageTask.mockResolvedValue({
            id: "img-1",
            status: "success",
            prompt: "上游图片提示词",
            result: { serverUrl: "https://cdn/a.png", remoteUrl: "https://remote/a.png", dataUrl: "data:image/png;base64,x", width: 720, height: 1280 },
        });
        const result = await call(shot({ storyboardTaskId: "img-1", storyboardStatus: "running" }));

        expect(result.shot.storyboardStatus).toBe("success");
        expect(result.shot.storyboardImageUrl).toBe("https://cdn/a.png");
        expect(result.shot.storyboardImageWidth).toBe(720);
        expect(result.shot.storyboardHistory?.[0]).toMatchObject({ taskId: "img-1", url: "https://cdn/a.png", width: 720 });
    });

    it("records an error when a succeeded image has no persistable url", async () => {
        mocks.getImageTask.mockResolvedValue({ id: "img-1", status: "success", result: { dataUrl: "blob:whatever" } });
        const result = await call(shot({ storyboardTaskId: "img-1", storyboardStatus: "running" }));
        expect(result.shot.storyboardStatus).toBe("error");
        expect(result.shot.storyboardError).toContain("没有返回可持久化图片地址");
    });

    it("writes back a finished video url", async () => {
        mocks.getVideoTask.mockResolvedValue({ id: "vid-1", status: "success", prompt: "上游视频提示词", result: { url: "https://cdn/a.mp4" } });
        const result = await call(shot({ generationTaskId: "vid-1", generationStatus: "running" }));
        expect(result.shot.generationStatus).toBe("success");
        expect(result.shot.videoUrl).toBe("https://cdn/a.mp4");
        expect(result.shot.videoHistory?.[0]).toMatchObject({ taskId: "vid-1", url: "https://cdn/a.mp4" });
    });

    it("marks a succeeded video without a playable url as an error", async () => {
        mocks.getVideoTask.mockResolvedValue({ id: "vid-1", status: "success", result: {} });
        const result = await call(shot({ generationTaskId: "vid-1", generationStatus: "running" }));
        expect(result.shot.generationStatus).toBe("error");
        expect(result.shot.generationError).toContain("没有返回可播放地址");
    });

    it("propagates upstream failure and cancellation onto the shot", async () => {
        mocks.getImageTask.mockResolvedValue({ id: "img-1", status: "error", error: "上游拒绝" });
        expect((await call(shot({ storyboardTaskId: "img-1", storyboardStatus: "running" }))).shot.storyboardError).toBe("上游拒绝");

        mocks.getVideoTask.mockResolvedValue({ id: "vid-1", status: "cancelled" });
        expect((await call(shot({ generationTaskId: "vid-1", generationStatus: "running" }))).shot.generationError).toContain("已取消");
    });

    it("unbinds a lost task so the shot is not locked forever", async () => {
        mocks.getVideoTask.mockResolvedValue(null);
        const result = await call(shot({ generationTaskId: "vid-1", generationStatus: "running" }));
        expect(result.shot.generationTaskId).toBeUndefined();
        expect(result.shot.generationStatus).toBe("error");
        expect(result.shot.generationError).toContain("任务记录不存在");
    });

    it("is idempotent: a repeated poll with an unchanged result writes nothing", async () => {
        mocks.getVideoTask.mockResolvedValue({ id: "vid-1", status: "success", prompt: "视频提示词", result: { url: "https://cdn/a.mp4" } });
        const settled = shot({
            generationTaskId: "vid-1",
            generationStatus: "success",
            videoUrl: "https://cdn/a.mp4",
            videoHistory: [{ id: "video:vid-1", taskId: "vid-1", url: "https://cdn/a.mp4", prompt: "视频提示词", createdAt: "2026-09-01T00:00:00.000Z" }],
        });
        const result = await call(settled);
        expect(result.changed).toBe(false);
        expect(mocks.persist).not.toHaveBeenCalled();
    });

    it("keeps a pending task pending without touching the shot", async () => {
        mocks.getImageTask.mockResolvedValue({ id: "img-1", status: "running" });
        const result = await call(shot({ storyboardTaskId: "img-1", storyboardStatus: "running" }));
        expect(result.changed).toBe(false);
    });
});
