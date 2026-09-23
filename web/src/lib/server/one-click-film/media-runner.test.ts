import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({ getImageTask: vi.fn(), getVideoTask: vi.fn(), fetchInternalApi: vi.fn(), sync: vi.fn() }));
vi.mock("@/lib/server/image-task-store", () => ({ getImageTask: mocks.getImageTask }));
vi.mock("@/lib/server/video-task-store", () => ({ getVideoTask: mocks.getVideoTask }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.fetchInternalApi }));
vi.mock("./sync-runner", () => ({ syncOneClickShotGeneration: mocks.sync }));

import { runOneClickMediaForEpisodes } from "./media-runner";

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
        imagePrompt: "",
        videoPrompt: "",
        cameraMotion: "",
        duration: 3,
        characterIds: [],
        propIds: [],
        clueIds: [],
        ...extra,
    };
}

const runtime = { origin: "http://internal", cookie: "session=1" };
const input = (s: DramaShot) => ({
    taskId: "task-1",
    userId: "u1",
    project: { id: "p1", episodes: [{ id: "e1", shots: [s] }] } as unknown as DramaProject,
    episodeIds: ["e1"],
    runtime,
});

beforeEach(() => {
    vi.clearAllMocks();
    mocks.fetchInternalApi.mockResolvedValue({ ok: true, json: async () => ({ code: 0, data: { task: { id: "new-task" } } }) });
    // 默认：回写未产生变化（任务仍在跑）
    mocks.sync.mockImplementation(async (args: { project: unknown }) => ({ project: args.project, shot: shot({ storyboardTaskId: "img-1" }), changed: false }));
});

describe("one-click-film media runner", () => {
    it("dispatches image work to the one-click-film route, never to drama-lab", async () => {
        const result = await runOneClickMediaForEpisodes("image", input(shot()));

        const [url] = mocks.fetchInternalApi.mock.calls[0] as [string];
        expect(url).toContain("/api/one-click-film/projects/p1/shots/s1/generate-image");
        expect(url).toContain("episodeId=e1");
        // 这是本次修复的核心断言：绝不能再打到教学版链路上。
        expect(url).not.toContain("drama-lab");
        expect(result.status).toBe("pending");
        expect(result.childTaskIds).toEqual(["new-task"]);
    });

    it("dispatches video work to the one-click-film route", async () => {
        await runOneClickMediaForEpisodes("video", input(shot()));
        const [url] = mocks.fetchInternalApi.mock.calls[0] as [string];
        expect(url).toContain("/shots/s1/generate-video");
        expect(url).not.toContain("drama-lab");
    });

    it("reuses a finished image without resubmitting", async () => {
        const result = await runOneClickMediaForEpisodes("image", input(shot({ storyboardImageUrl: "https://cdn/a.png", storyboardTaskId: "img-1" })));
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
        expect(result.status).toBe("success");
        expect(result.outputRefs).toEqual([{ episodeId: "e1", shotId: "s1", kind: "storyboard-image", url: "https://cdn/a.png" }]);
    });

    it("prefers a generated key frame over the legacy storyboard image", async () => {
        const result = await runOneClickMediaForEpisodes("image", input(shot({ frames: { key: { prompt: "p", status: "success", url: "https://cdn/key.png" } }, storyboardImageUrl: "https://cdn/legacy.png" })));
        expect(result.outputRefs[0]).toMatchObject({ url: "https://cdn/key.png" });
    });

    it("keeps polling an in-flight task instead of resubmitting it", async () => {
        mocks.getImageTask.mockResolvedValue({ status: "running" });
        const result = await runOneClickMediaForEpisodes("image", input(shot({ storyboardTaskId: "img-1" })));
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
        expect(result.status).toBe("pending");
        expect(result.childTaskIds).toEqual(["img-1"]);
    });

    it("triggers write-back itself so a bound task cannot stall forever", async () => {
        // 回归防护：调 sync 的原本只有创作工坊链路，media-runner 接管后必须自己触发回写，
        // 否则上游成功了也没人把 URL 写回分镜，images/videos 会永久 pending。
        mocks.getImageTask.mockResolvedValue({ status: "success" });
        mocks.sync.mockImplementation(async (args: { project: unknown }) => ({
            project: args.project,
            shot: shot({ storyboardTaskId: "img-1", storyboardImageUrl: "https://cdn/written.png" }),
            changed: true,
        }));

        const result = await runOneClickMediaForEpisodes("image", input(shot({ storyboardTaskId: "img-1" })));

        expect(mocks.sync).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", episodeId: "e1", shotId: "s1" }));
        expect(result.status).toBe("success");
        expect(result.outputRefs).toEqual([{ episodeId: "e1", shotId: "s1", kind: "storyboard-image", url: "https://cdn/written.png" }]);
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
    });

    it("raises a write-back failure instead of looping pending forever", async () => {
        mocks.getVideoTask.mockResolvedValue({ status: "success" });
        mocks.sync.mockImplementation(async (args: { project: unknown }) => ({
            project: args.project,
            shot: shot({ generationTaskId: "vid-1", generationError: "分镜视频任务没有返回可播放地址" }),
            changed: true,
        }));
        await expect(runOneClickMediaForEpisodes("video", input(shot({ generationTaskId: "vid-1" })))).rejects.toThrow("没有返回可播放地址");
    });

    it("stays pending while write-back reports no change yet", async () => {
        mocks.getVideoTask.mockResolvedValue({ status: "running" });
        const result = await runOneClickMediaForEpisodes("video", input(shot({ generationTaskId: "vid-1" })));
        expect(mocks.sync).toHaveBeenCalled();
        expect(mocks.fetchInternalApi).not.toHaveBeenCalled();
        expect(result.status).toBe("pending");
    });

    it("surfaces upstream failures and cancellations", async () => {
        mocks.getImageTask.mockResolvedValue({ status: "error", error: "上游拒绝" });
        await expect(runOneClickMediaForEpisodes("image", input(shot({ storyboardTaskId: "img-1" })))).rejects.toThrow("上游拒绝");

        mocks.getVideoTask.mockResolvedValue({ status: "cancelled" });
        await expect(runOneClickMediaForEpisodes("video", input(shot({ generationTaskId: "vid-1" })))).rejects.toThrow("已取消");
    });

    it("propagates a route rejection message", async () => {
        mocks.fetchInternalApi.mockResolvedValue({ ok: false, json: async () => ({ code: 409, msg: "当前分镜已有视频任务正在执行" }) });
        await expect(runOneClickMediaForEpisodes("video", input(shot()))).rejects.toThrow("当前分镜已有视频任务正在执行");
    });

    it("fails fast when the project has no shots", async () => {
        const empty = { taskId: "t", userId: "u1", project: { id: "p1", episodes: [{ id: "e1", shots: [] }] } as unknown as DramaProject, episodeIds: ["e1"], runtime };
        await expect(runOneClickMediaForEpisodes("image", empty)).rejects.toThrow("没有分镜");
    });
});
