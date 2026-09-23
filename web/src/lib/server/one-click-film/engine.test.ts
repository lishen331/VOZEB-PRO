import { describe, expect, it, vi } from "vitest";

import { advanceOneClickFilmWorkflow, createOneClickFilmWorkflow, oneClickFilmTaskView, pauseOneClickFilmWorkflow, resumeOneClickFilmWorkflow } from "./engine";
import type { OneClickFilmExecutor, OneClickFilmStartInput, OneClickFilmStep } from "./types";

/**
 * 基线：L 的两个 §2 入口 —— `startOneClickPipeline`（一键成片带图片视频）与
 * `startTextFrameworkPipeline`（仅提取角色/场景/道具与分镜文本，不生成图片与视频）。
 *
 * 真实行为测试：跳过集合写错会直接导致多花钱（该跳的没跳）或少产出（不该跳的跳了）。
 */
function startInput(extra: Partial<OneClickFilmStartInput> = {}): OneClickFilmStartInput {
    return { userId: "u1", projectId: "p1", clientRequestId: "req-1", episodeIds: ["e1"], ...extra };
}

function statusOf(steps: OneClickFilmStep[], key: OneClickFilmStep["key"]) {
    const found = steps.find((step) => step.key === key);
    if (!found) throw new Error("missing step: " + key);
    return found.status;
}

describe("createOneClickFilmWorkflow", () => {
    it("keeps all seven steps pending for the full pipeline", () => {
        const task = createOneClickFilmWorkflow(startInput());
        expect(task.workflow.steps.map((step) => step.key)).toEqual(["script", "assets", "storyboard", "images", "videos", "audio", "compose"]);
        expect(task.workflow.steps.every((step) => step.status === "pending")).toBe(true);
        expect(task.title).toBe("一键成片");
    });

    it("skips the media steps for text_framework, matching L's second entry", () => {
        const task = createOneClickFilmWorkflow(startInput({ options: { mode: "text_framework" } }));
        // 该跑的三步
        for (const key of ["script", "assets", "storyboard"] as const) expect(statusOf(task.workflow.steps, key)).toBe("pending");
        // 该跳的四步：跳错就会产生真实费用
        for (const key of ["images", "videos", "audio", "compose"] as const) expect(statusOf(task.workflow.steps, key)).toBe("skipped");
        expect(task.title).toBe("生成文本框架");
    });

    it("still lists every step so the UI can show what was skipped", () => {
        const task = createOneClickFilmWorkflow(startInput({ options: { mode: "text_framework" } }));
        expect(task.workflow.steps).toHaveLength(7);
    });

    it("ignores an unrelated mode value", () => {
        const task = createOneClickFilmWorkflow(startInput({ options: { mode: "something_else" } }));
        expect(task.workflow.steps.every((step) => step.status === "pending")).toBe(true);
        expect(task.title).toBe("一键成片");
    });
});

describe("advanceOneClickFilmWorkflow with skipped steps", () => {
    it("never invokes the executor for skipped steps", async () => {
        const task = createOneClickFilmWorkflow(startInput({ options: { mode: "text_framework" } }));
        const executor = vi.fn<OneClickFilmExecutor>(async () => ({ status: "success" as const }));
        const next = await advanceOneClickFilmWorkflow(task, executor);
        const invoked = executor.mock.calls.map((call) => call[0].step.key);
        expect(invoked).toEqual(["script", "assets", "storyboard"]);
        expect(next.status).toBe("success");
    });

    it("reaches 100% progress without running the media steps", async () => {
        const task = createOneClickFilmWorkflow(startInput({ options: { mode: "text_framework" } }));
        const next = await advanceOneClickFilmWorkflow(task, async () => ({ status: "success" as const }));
        expect(oneClickFilmTaskView(next).progress).toBe(100);
    });

    it("still runs every step for the full pipeline", async () => {
        const task = createOneClickFilmWorkflow(startInput());
        const executor = vi.fn<OneClickFilmExecutor>(async () => ({ status: "success" as const }));
        await advanceOneClickFilmWorkflow(task, executor);
        expect(executor).toHaveBeenCalledTimes(7);
    });
});

/**
 * 对应 L 的 `pipelinePaused`。这里测真实行为，不测标志位本身：
 * 暂停后推进器绝不能再启动下一步（否则用户关掉页面仍会继续花钱），
 * 继续后必须从原断点接着跑，不能从头重跑（否则重复扣费）。
 */
describe("pause / continue the one-click pipeline", () => {
    it("stops launching further steps once paused", async () => {
        const task = createOneClickFilmWorkflow(startInput());
        const executor = vi.fn<OneClickFilmExecutor>(async () => ({ status: "success" as const }));
        pauseOneClickFilmWorkflow(task);
        const next = await advanceOneClickFilmWorkflow(task, executor);
        expect(executor).not.toHaveBeenCalled();
        expect(next.status).toBe("pending");
        expect(next.workflow.currentStepIndex).toBe(0);
        expect(oneClickFilmTaskView(next).paused).toBe(true);
    });

    it("resumes from the same step instead of restarting the pipeline", async () => {
        const task = createOneClickFilmWorkflow(startInput());
        const executor = vi.fn<OneClickFilmExecutor>(async () => ({ status: "success" as const }));
        // 先跑完前两步，再暂停。
        await advanceOneClickFilmWorkflow(task, async ({ step }) => ({ status: step.key === "storyboard" ? ("pending" as const) : ("success" as const) }));
        const reached = task.workflow.currentStepIndex;
        expect(reached).toBe(2);
        pauseOneClickFilmWorkflow(task);
        await advanceOneClickFilmWorkflow(task, executor);
        expect(executor).not.toHaveBeenCalled();

        resumeOneClickFilmWorkflow(task);
        expect(oneClickFilmTaskView(task).paused).toBeUndefined();
        const done = await advanceOneClickFilmWorkflow(task, executor);
        // 只跑剩下的五步，已成功的 script / assets 不会被重跑。
        expect(executor.mock.calls.map((call) => call[0].step.key)).toEqual(["storyboard", "images", "videos", "audio", "compose"]);
        expect(done.status).toBe("success");
    });

    it("refuses to pause a settled task", () => {
        const task = createOneClickFilmWorkflow(startInput());
        task.status = "success";
        expect(pauseOneClickFilmWorkflow(task).workflow.paused).toBeUndefined();
    });
});
