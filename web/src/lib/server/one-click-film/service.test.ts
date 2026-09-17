import { beforeEach, describe, expect, it, vi } from "vitest";

const { store, schedule } = vi.hoisted(() => ({ store: { create: vi.fn(), get: vi.fn(), getByRequest: vi.fn(), update: vi.fn() }, schedule: vi.fn() }));
vi.mock("@/lib/server/generation-task-scheduler", () => ({ scheduleGenerationTask: schedule }));
vi.mock("@/lib/server/generation-task-store", () => ({ createStoredGenerationTask: store.create, getStoredGenerationTask: store.get, getStoredGenerationTaskByRequest: store.getByRequest, updateStoredGenerationTask: store.update }));

import { advanceOneClickFilm, cancelOneClickFilm, oneClickFilmTaskView, retryOneClickFilm, startOneClickFilm } from "./service";
import type { OneClickFilmTask } from "./types";

const base = { userId: "u1", projectId: "p1", clientRequestId: "request-1", episodeIds: ["e1"] };
beforeEach(() => {
    vi.clearAllMocks();
    store.create.mockImplementation(async (_t: string, t: OneClickFilmTask) => t);
    store.update.mockImplementation(async (_t: string, t: OneClickFilmTask) => t);
    schedule.mockResolvedValue(undefined);
});

describe("one-click-film orchestration", () => {
    it("creates an L-shaped durable parent with ordered child-capable steps", async () => {
        const task = await startOneClickFilm(base);
        expect(task.source).toBe("one-click-film");
        expect(task.workflow.steps.map((s) => s.key)).toEqual(["script", "assets", "storyboard", "images", "videos", "audio", "compose"]);
        expect(store.create).toHaveBeenCalledWith("render", expect.objectContaining({ source: "one-click-film" }), expect.any(Number));
        // 落库后必须立刻入调度队列，否则用户关掉页面就再没有 worker 推进父任务。
        expect(schedule).toHaveBeenCalledWith("render", task.id, expect.objectContaining({ executionPhase: "created" }));
    });
    it("is idempotent for the same request and rejects cross-project reuse", async () => {
        const first = await startOneClickFilm(base);
        store.getByRequest.mockResolvedValue(first);
        await expect(startOneClickFilm(base)).resolves.toBe(first);
        await expect(startOneClickFilm({ ...base, projectId: "other" })).rejects.toThrow("请求编号已用于其他任务");
    });
    it("persists pending children and skips already completed steps", async () => {
        const task = await startOneClickFilm(base);
        store.get.mockResolvedValue(task);
        const pending = await advanceOneClickFilm(task.id, "u1", async () => ({ status: "pending", childTaskIds: ["child-1"] }));
        expect(pending?.status).toBe("running");
        expect(pending?.workflow.steps[0].childTaskIds).toEqual(["child-1"]);
        const completed = await advanceOneClickFilm(task.id, "u1", async () => ({ status: "success", outputRefs: [{ id: "script" }] }));
        expect(completed?.workflow.steps[0].status).toBe("success");
    });
    it("supports cancellation, retry from failed step, and progress view", async () => {
        const task = await startOneClickFilm(base);
        store.get.mockResolvedValue(task);
        const cancelled = await cancelOneClickFilm(task.id, "u1");
        expect(cancelled?.status).toBe("cancelled");
        schedule.mockClear();
        // retry 只接受 error/cancelled 的父任务，必须把取消后的状态回灌给存储层。
        store.get.mockResolvedValue(cancelled);
        const retried = await retryOneClickFilm(task.id, "u1");
        expect(retried?.status).toBe("pending");
        expect(schedule).toHaveBeenCalledWith("render", task.id, expect.objectContaining({ executionPhase: "created" }));
        expect(oneClickFilmTaskView(retried!).progress).toBe(0);
    });
});
