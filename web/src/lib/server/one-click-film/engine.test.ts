import { describe, expect, it, vi } from "vitest";

import { advanceOneClickFilmWorkflow, createOneClickFilmWorkflow, oneClickFilmTaskView } from "./engine";
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
