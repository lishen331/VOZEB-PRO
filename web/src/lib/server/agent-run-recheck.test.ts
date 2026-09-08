import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), schedule: vi.fn() }));
vi.mock("./generation-task-store", () => ({ getStoredGenerationTaskRecord: mocks.get }));
vi.mock("./agent-run-store", () => ({ updateAgentRunById: mocks.update }));
vi.mock("./generation-task-scheduler", () => ({ scheduleGenerationTask: mocks.schedule }));
import { recheckAgentRun } from "./agent-run-recheck";
import { runFixture, imageTask } from "./agent-run-executor.test-fixtures";
beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockImplementation(async (_id, patch) => patch);
});
describe("Agent recheck retains original identities", () => {
    it("validates all children before scheduling any query", async () => {
        const run = runFixture({
            status: "paused",
            tasks: [
                { ...imageTask("a"), status: "needs_review", taskId: "a" },
                { ...imageTask("b"), status: "needs_review", taskId: "b" },
            ],
        });
        mocks.get.mockImplementation(async (_type, id) => ({ id, userId: id === "a" ? run.userId : "other", status: "running", executionPhase: "needs_review", upstreamTaskId: "upstream", payload: {} }));
        await expect(recheckAgentRun(run)).rejects.toThrow();
        expect(mocks.schedule).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
    });

    it("recovers a completed sibling but never resubmits the unknown child", async () => {
        const run = runFixture({
            status: "paused",
            tasks: [
                { ...imageTask("unknown"), status: "needs_review", taskId: "u", childTasks: [{ id: "u", status: "needs_review", attempt: 1 }] },
                { ...imageTask("finished"), status: "running", taskId: "f", childTasks: [{ id: "f", status: "pending", attempt: 1 }] },
            ],
        });
        mocks.get.mockImplementation(async (_type, id) => ({ id, userId: run.userId, status: id === "f" ? "success" : "running", executionPhase: id === "f" ? "completed" : "needs_review", payload: {} }));
        const result = await recheckAgentRun(run);
        expect(result.tasks[0]).toMatchObject({ taskId: "u", status: "needs_review" });
        expect(result.tasks[1]).toMatchObject({ taskId: "f", status: "running" });
        expect(result.status).toBe("running");
        expect(mocks.schedule).not.toHaveBeenCalled();
    });
    it("keeps unknown submission paused without inventing a task ID", async () => {
        const run = runFixture({ status: "paused", tasks: [{ ...imageTask("unknown"), status: "needs_review", taskId: "u" }] });
        mocks.get.mockResolvedValue({ id: "u", userId: run.userId, status: "running", executionPhase: "needs_review", payload: {} });
        const result = await recheckAgentRun(run);
        expect(result).toBe(run);
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.schedule).not.toHaveBeenCalled();
    });
    it("rearms only known upstream identities and checks ownership", async () => {
        const run = runFixture({ status: "paused", tasks: [{ ...imageTask("review"), status: "needs_review", taskId: "r" }] });
        mocks.get.mockResolvedValue({ id: "r", userId: "different", status: "running", upstreamTaskId: "upstream" });
        await expect(recheckAgentRun(run)).rejects.toThrow();
        expect(mocks.schedule).not.toHaveBeenCalled();
        mocks.get.mockResolvedValue({ id: "r", userId: run.userId, status: "running", executionPhase: "needs_review", upstreamTaskId: "upstream", payload: {} });
        expect((await recheckAgentRun(run)).status).toBe("running");
        expect(mocks.schedule).toHaveBeenCalledWith("image", "r", expect.objectContaining({ executionPhase: "polling", upstreamTaskId: "upstream" }));
    });
});
