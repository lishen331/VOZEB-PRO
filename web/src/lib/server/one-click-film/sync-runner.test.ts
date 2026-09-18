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

/**
 * 序列图拆分的触发条件。重点不是"能不能拆"，而是：
 * 1. 普通单图绝不触发（多跑一次下载+裁剪纯属浪费）；
 * 2. 缺 origin 时静默跳过，回写照常（否则整条同步会挂）；
 * 3. **拆分失败绝不能把已成功的生图判为失败** —— 用户已经为这张图付过费了；
 * 4. 同一任务不重复拆，避免候选翻倍。
 */
describe("one-click-film sequence grid split trigger", () => {
    const successTask = {
        id: "img-grid",
        status: "success",
        prompt: "网格提示词",
        result: { serverUrl: "https://cdn/grid.png", width: 1024, height: 1024 },
    };

    // 注意不能用默认参数表达"省略 origin"：显式传 undefined 会触发默认值，
    // 于是 origin 又变回 http://localhost，测不到真正的缺省分支。
    function callWith(s: DramaShot, split: ReturnType<typeof vi.fn>, options: { origin?: string } = { origin: "http://localhost" }) {
        return syncOneClickShotGeneration({
            userId: "u1",
            project: project(s),
            episodeId: "e1",
            shotId: "s1",
            ...(options.origin === undefined ? {} : { origin: options.origin }),
            splitSequenceGrid: split as never,
        });
    }

    it("never splits a plain single-image shot", async () => {
        mocks.getImageTask.mockResolvedValue(successTask);
        const split = vi.fn();
        const result = await callWith(shot({ storyboardTaskId: "img-grid", storyboardStatus: "running", storyboardSequenceMode: "single" }), split);
        expect(split).not.toHaveBeenCalled();
        expect(result.shot.storyboardStatus).toBe("success");
    });

    it("splits a quad grid once the image is written back", async () => {
        mocks.getImageTask.mockResolvedValue(successTask);
        const split = vi.fn(async (input: { project: DramaProject }) => ({ project: input.project, panels: [] }));
        await callWith(shot({ storyboardTaskId: "img-grid", storyboardStatus: "running", storyboardSequenceMode: "quad_grid" }), split);
        expect(split).toHaveBeenCalledTimes(1);
        // 必须拿回写后的图片地址去拆，而不是拆前的空值。
        expect(split.mock.calls[0][0]).toMatchObject({ mode: "quad_grid", sourceUrl: "https://cdn/grid.png", taskId: "img-grid" });
    });

    it("skips the split without breaking write-back when origin is missing", async () => {
        mocks.getImageTask.mockResolvedValue(successTask);
        const split = vi.fn();
        const result = await callWith(shot({ storyboardTaskId: "img-grid", storyboardStatus: "running", storyboardSequenceMode: "quad_grid" }), split, {});
        expect(split).not.toHaveBeenCalled();
        expect(result.shot.storyboardStatus).toBe("success");
        expect(result.shot.storyboardImageUrl).toBe("https://cdn/grid.png");
    });

    it("keeps the paid image successful when splitting throws", async () => {
        mocks.getImageTask.mockResolvedValue(successTask);
        const split = vi.fn(async () => {
            throw new Error("sharp 裁剪失败");
        });
        const result = await callWith(shot({ storyboardTaskId: "img-grid", storyboardStatus: "running", storyboardSequenceMode: "quad_grid" }), split);
        expect(split).toHaveBeenCalledTimes(1);
        // 整张网格图仍然可用，绝不因为候选拆分失败而让用户白付费。
        expect(result.shot.storyboardStatus).toBe("success");
        expect(result.shot.storyboardImageUrl).toBe("https://cdn/grid.png");
        expect(result.shot.storyboardError).toBeUndefined();
    });

    it("does not split the same task twice", async () => {
        mocks.getImageTask.mockResolvedValue(successTask);
        const split = vi.fn();
        const already = shot({
            storyboardTaskId: "img-grid",
            storyboardStatus: "running",
            storyboardSequenceMode: "quad_grid",
            // 面板带各自的 taskId（img-grid:panel0），否则会被回写的 taskId 去重清掉。
            storyboardHistory: [{ id: "sequence-panel:img-grid:0", taskId: "img-grid:panel0", url: "/panel0.png", prompt: "[平视]", createdAt: "2026-09-18T00:00:00Z" }],
        });
        await callWith(already, split);
        expect(split).not.toHaveBeenCalled();
    });
});
