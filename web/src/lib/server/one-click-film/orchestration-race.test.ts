import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OneClickFilmTask } from "./types";
const state = vi.hoisted(() => ({ task: null as OneClickFilmTask | null }));
vi.mock("@/lib/server/generation-task-store", () => ({
    createStoredGenerationTask: vi.fn(),
    getStoredGenerationTaskByRequest: vi.fn(),
    getStoredGenerationTask: vi.fn(async () => structuredClone(state.task)),
    updateStoredGenerationTask: vi.fn(async (_type: string, task: OneClickFilmTask) => {
        state.task = structuredClone(task);
        return task;
    }),
    mutateStoredGenerationTask: vi.fn(async (_type: string, _id: string, _ttl: number, mutate: (task: OneClickFilmTask) => OneClickFilmTask | null) => {
        const next = mutate(structuredClone(state.task!));
        if (next) state.task = structuredClone(next);
        return structuredClone(next);
    }),
}));
vi.mock("@/lib/server/generation-task-scheduler", () => ({ scheduleGenerationTask: vi.fn() }));
import { createOneClickFilmWorkflow } from "./engine";
import { advanceOneClickFilm, pauseOneClickFilm, cancelOneClickFilm, retryOneClickFilm } from "./orchestration";
function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return { promise, resolve };
}
beforeEach(() => {
    state.task = createOneClickFilmWorkflow({ userId: "u", projectId: "p", clientRequestId: "r", episodeIds: ["e"] });
});
describe("durable workflow controls while executor is awaiting", () => {
    it("honors a live lease from another worker without calling the executor", async () => {
        state.task!.workflow.advanceLease = { token: "other-process", expiresAt: Date.now() + 60_000 };
        const executor = vi.fn();
        await advanceOneClickFilm(state.task!.id, "u", executor);
        expect(executor).not.toHaveBeenCalled();
        expect(state.task!.workflow.advanceLease?.token).toBe("other-process");
    });
    it("recovers an expired lease but executes only one durable step", async () => {
        state.task!.workflow.advanceLease = { token: "crashed-process", expiresAt: Date.now() - 1 };
        const executor = vi.fn(async () => ({ status: "success" as const }));
        await advanceOneClickFilm(state.task!.id, "u", executor);
        expect(executor).toHaveBeenCalledTimes(1);
        expect(state.task!.workflow.advanceLease).toBeUndefined();
    });
    it.each(["pause", "cancel"])("does not overwrite %s or start another step", async (action) => {
        const entered = deferred(),
            release = deferred();
        const executor = vi.fn(async () => {
            entered.resolve();
            await release.promise;
            return { status: "success" as const, childTaskIds: ["paid-task"] };
        });
        const pending = advanceOneClickFilm(state.task!.id, "u", executor);
        await entered.promise;
        if (action === "pause") await pauseOneClickFilm(state.task!.id, "u");
        else await cancelOneClickFilm(state.task!.id, "u");
        release.resolve();
        await pending;
        expect(executor).toHaveBeenCalledTimes(1);
        if (action === "pause") expect(state.task!.workflow.paused).toBe(true);
        else expect(state.task!.status).toBe("cancelled");
    });
    it("does not let executor failure erase cancellation", async () => {
        const entered = deferred(),
            release = deferred();
        const pending = advanceOneClickFilm(state.task!.id, "u", async () => {
            entered.resolve();
            await release.promise;
            throw Error("upstream failure");
        });
        await entered.promise;
        await cancelOneClickFilm(state.task!.id, "u");
        release.resolve();
        await pending;
        expect(state.task!.status).toBe("cancelled");
    });
    it("fences an old completion after cancel and retry", async () => {
        const entered = deferred(),
            release = deferred();
        const pending = advanceOneClickFilm(state.task!.id, "u", async () => {
            entered.resolve();
            await release.promise;
            return { status: "success" as const };
        });
        await entered.promise;
        await cancelOneClickFilm(state.task!.id, "u");
        await retryOneClickFilm(state.task!.id, "u");
        release.resolve();
        await pending;
        expect(state.task!.status).toBe("pending");
        expect(state.task!.workflow.steps[0].status).toBe("pending");
    });
});
