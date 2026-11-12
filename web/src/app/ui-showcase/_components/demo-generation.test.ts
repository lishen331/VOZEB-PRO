import { afterEach, describe, expect, it, vi } from "vitest";

import { createDemoGeneration } from "./demo-generation";

afterEach(() => vi.useRealTimers());

describe("local-only generation timeline", () => {
    it("ignores duplicate starts and completes once", () => {
        vi.useFakeTimers();
        const update = vi.fn();
        const run = createDemoGeneration(update);
        expect(run.start()).toBe(true);
        expect(run.start()).toBe(false);
        vi.runAllTimers();
        expect(update.mock.calls.filter(([state]) => state.status === "success")).toHaveLength(1);
        expect(update).toHaveBeenLastCalledWith({ status: "success", progress: 100 });
        expect(vi.getTimerCount()).toBe(0);
    });
    it("can restart after success without an old reset interrupting it", () => {
        vi.useFakeTimers();
        const update = vi.fn();
        const run = createDemoGeneration(update);
        run.start();
        vi.runAllTimers();
        expect(run.start()).toBe(true);
        vi.runAllTimers();
        expect(update.mock.calls.filter(([state]) => state.status === "success")).toHaveLength(2);
        expect(vi.getTimerCount()).toBe(0);
    });
    it("allows an explicit retry after a simulated failure", () => {
        vi.useFakeTimers();
        const update = vi.fn();
        const run = createDemoGeneration(update);
        run.start(true);
        vi.runAllTimers();
        expect(update.mock.lastCall?.[0].status).toBe("error");
        run.start();
        vi.runAllTimers();
        expect(update).toHaveBeenLastCalledWith({ status: "success", progress: 100 });
    });
    it("cancels cleanly and never updates an unmounted preview", () => {
        vi.useFakeTimers();
        const update = vi.fn();
        const run = createDemoGeneration(update);
        run.start();
        run.cancel();
        expect(update).toHaveBeenLastCalledWith({ status: "idle", progress: 0 });
        run.start();
        run.dispose();
        const count = update.mock.calls.length;
        vi.runAllTimers();
        expect(update).toHaveBeenCalledTimes(count);
        expect(vi.getTimerCount()).toBe(0);
    });
});
