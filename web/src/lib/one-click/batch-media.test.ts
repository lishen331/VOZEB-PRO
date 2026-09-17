import { describe, expect, it, vi } from "vitest";

import type { DramaShot } from "@/lib/drama-project-contract";
import { BATCH_MEDIA_CONCURRENCY, runBatchMedia, shotHasMedia, shotSettleState } from "./batch-media";

/**
 * 基线：L `startBatchImageGeneration` / `startBatchVideoGeneration`
 * （FilmCreate.vue 6935 起）—— 客户端并发循环 + 协作式停止 + 逐条错误收集。
 *
 * 真实行为测试：并发数、跳过策略、停止时机错了会直接算出不同结果。
 */
function shot(extra: Partial<DramaShot> = {}): DramaShot {
    return {
        id: "s1",
        order: 1,
        title: "镜头",
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
    } as DramaShot;
}

/** 立即结束的 wait，避免测试真的睡 3 秒。 */
const fastWait = () => Promise.resolve();

describe("shotHasMedia (L hasSbImage / hasSbVideo parity)", () => {
    it("counts first/last frame slots as having an image", () => {
        expect(shotHasMedia(shot({ storyboardImageUrl: "/a.png" }), "image")).toBe(true);
        expect(shotHasMedia(shot({ frames: { first: { prompt: "p", status: "success", url: "/f.png" } } }), "image")).toBe(true);
        expect(shotHasMedia(shot({ frames: { last: { prompt: "p", status: "success", url: "/l.png" } } }), "image")).toBe(true);
        expect(shotHasMedia(shot(), "image")).toBe(false);
    });

    it("ignores blank urls so blanks are not mistaken for finished work", () => {
        expect(shotHasMedia(shot({ storyboardImageUrl: "   " }), "image")).toBe(false);
        expect(shotHasMedia(shot({ videoUrl: "  " }), "video")).toBe(false);
    });

    it("keeps image and video independent", () => {
        expect(shotHasMedia(shot({ storyboardImageUrl: "/a.png" }), "video")).toBe(false);
        expect(shotHasMedia(shot({ videoUrl: "/v.mp4" }), "image")).toBe(false);
    });
});

describe("shotSettleState", () => {
    it("treats an existing asset as done regardless of status", () => {
        expect(shotSettleState(shot({ storyboardImageUrl: "/a.png", storyboardStatus: "running" }), "image")).toEqual({ state: "done" });
    });

    it("surfaces the server error message", () => {
        expect(shotSettleState(shot({ storyboardStatus: "error", storyboardError: "上游 429" }), "image")).toEqual({ state: "error", error: "上游 429" });
        expect(shotSettleState(shot({ generationStatus: "cancelled" }), "video")).toEqual({ state: "error", error: "任务已取消" });
    });

    it("stays pending while queued or running", () => {
        for (const status of ["queued", "pending", "running"] as const) {
            expect(shotSettleState(shot({ storyboardStatus: status }), "image")).toEqual({ state: "pending" });
        }
    });

    it("treats a missing shot as pending rather than done", () => {
        expect(shotSettleState(undefined, "image")).toEqual({ state: "pending" });
    });
});

describe("runBatchMedia (L batch generation parity)", () => {
    it("skips shots that already have media, like L's todo filter", async () => {
        const shots = [shot({ id: "a", order: 1, storyboardImageUrl: "/a.png" }), shot({ id: "b", order: 2 })];
        const submit = vi.fn<(shot: DramaShot) => Promise<void>>(async () => {});
        const result = await runBatchMedia(shots, "image", {
            submit,
            reload: async () => [shot({ id: "b", order: 2, storyboardImageUrl: "/b.png" })],
            shouldStop: () => false,
            wait: fastWait,
        });
        expect(submit).toHaveBeenCalledTimes(1);
        expect(submit.mock.calls[0][0].id).toBe("b");
        expect(result).toMatchObject({ total: 1, completed: 1, failed: 0, stopped: false });
    });

    it("reports nothing to do when every shot already has media", async () => {
        const submit = vi.fn<(shot: DramaShot) => Promise<void>>(async () => {});
        const result = await runBatchMedia([shot({ storyboardImageUrl: "/a.png" })], "image", {
            submit,
            reload: async () => [],
            shouldStop: () => false,
            wait: fastWait,
        });
        expect(submit).not.toHaveBeenCalled();
        expect(result.total).toBe(0);
    });

    it("collects per-shot failures without aborting the rest", async () => {
        const shots = [shot({ id: "a", order: 1 }), shot({ id: "b", order: 2 }), shot({ id: "c", order: 3 })];
        const result = await runBatchMedia(shots, "image", {
            submit: async (target) => {
                if (target.id === "b") throw new Error("提交被拒");
            },
            reload: async () => shots.map((item) => (item.id === "b" ? item : shot({ ...item, storyboardImageUrl: "/x.png" }))),
            shouldStop: () => false,
            wait: fastWait,
            concurrency: 1,
        });
        expect(result.completed).toBe(3);
        expect(result.failed).toBe(1);
        // L 的错误文案是 `#序号: 原因`
        expect(result.errors).toEqual(["#2: 提交被拒"]);
    });

    it("surfaces a server-side failure discovered while polling", async () => {
        const result = await runBatchMedia([shot({ id: "a", order: 7 })], "image", {
            submit: async () => {},
            reload: async () => [shot({ id: "a", order: 7, storyboardStatus: "error", storyboardError: "上游 500" })],
            shouldStop: () => false,
            wait: fastWait,
        });
        expect(result.failed).toBe(1);
        expect(result.errors).toEqual(["#7: 上游 500"]);
    });

    it("stops cooperatively before picking up more work", async () => {
        const shots = [shot({ id: "a", order: 1 }), shot({ id: "b", order: 2 }), shot({ id: "c", order: 3 })];
        let submitted = 0;
        const result = await runBatchMedia(shots, "image", {
            submit: async () => {
                submitted += 1;
            },
            reload: async () => shots.map((item) => shot({ ...item, storyboardImageUrl: "/x.png" })),
            // 第一条完成后就请求停止
            shouldStop: () => submitted >= 1,
            wait: fastWait,
            concurrency: 1,
        });
        expect(submitted).toBe(1);
        expect(result.stopped).toBe(true);
        expect(result.completed).toBeLessThan(shots.length);
    });

    it("defaults to L's concurrency and never exceeds the queue length", async () => {
        expect(BATCH_MEDIA_CONCURRENCY).toBe(3);
        let inFlight = 0;
        let peak = 0;
        const shots = Array.from({ length: 6 }, (_, index) => shot({ id: `s${index}`, order: index + 1 }));
        await runBatchMedia(shots, "image", {
            submit: async () => {
                inFlight += 1;
                peak = Math.max(peak, inFlight);
                await Promise.resolve();
                inFlight -= 1;
            },
            reload: async () => shots.map((item) => shot({ ...item, storyboardImageUrl: "/x.png" })),
            shouldStop: () => false,
            wait: fastWait,
        });
        expect(peak).toBeLessThanOrEqual(BATCH_MEDIA_CONCURRENCY);
    });

    it("times out instead of polling forever", async () => {
        let clock = 0;
        const result = await runBatchMedia([shot({ id: "a", order: 1 })], "image", {
            submit: async () => {},
            // 永远 pending
            reload: async () => [shot({ id: "a", order: 1, storyboardStatus: "running" })],
            shouldStop: () => false,
            wait: fastWait,
            now: () => (clock += 60_000),
            timeoutMs: 120_000,
        });
        expect(result.failed).toBe(1);
        expect(result.errors[0]).toContain("等待超时");
    });

    it("reports progress as shots settle", async () => {
        const shots = [shot({ id: "a", order: 1 }), shot({ id: "b", order: 2 })];
        const seen: number[] = [];
        await runBatchMedia(shots, "image", {
            submit: async () => {},
            reload: async () => shots.map((item) => shot({ ...item, storyboardImageUrl: "/x.png" })),
            shouldStop: () => false,
            wait: fastWait,
            concurrency: 1,
            onProgress: (progress) => seen.push(progress.current),
        });
        expect(seen).toEqual([1, 2]);
    });
});
