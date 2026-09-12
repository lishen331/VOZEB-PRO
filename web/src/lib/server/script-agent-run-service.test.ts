import { describe, expect, it, vi } from "vitest";
import { ScriptAgentRunService } from "./script-agent-run-service";

const scope = { schoolId: "school-a", ownerUserId: "user-a" };
const baseRun = {
    id: "run-a",
    schoolId: "school-a",
    ownerUserId: "user-a",
    projectId: "project-a",
    runType: "short_story" as const,
    status: "planning" as const,
    clientRequestId: "request-a",
    configSnapshot: {},
    progress: {},
    lastEventSequence: 0,
    createdAt: "2026-09-13T00:00:00Z",
};

describe("ScriptAgentRunService", () => {
    it("returns the same idempotent run and appends a persisted start event", async () => {
        const repository = { createRun: vi.fn().mockResolvedValue(baseRun), appendRunEvent: vi.fn().mockResolvedValue({ sequence: 1 }) };
        const service = new ScriptAgentRunService(repository as never, () => "id-a");
        await service.create(scope, { projectId: "project-a", runType: "short_story", clientRequestId: "request-a" });
        expect(repository.createRun).toHaveBeenCalledOnce();
        expect(repository.appendRunEvent).toHaveBeenCalledWith(scope, "project-a", "run-a", "run_started", expect.objectContaining({ runType: "short_story" }), "id-a");
    });

    it("stops a running run without deleting saved work", async () => {
        const repository = { getRun: vi.fn().mockResolvedValue({ ...baseRun, status: "running" }), updateRun: vi.fn().mockResolvedValue({ ...baseRun, status: "stopped" }), appendRunEvent: vi.fn() };
        const service = new ScriptAgentRunService(repository as never, () => "event-stop");
        await service.stop(scope, "project-a", "run-a");
        expect(repository.updateRun).toHaveBeenCalledWith(scope, "project-a", "run-a", expect.objectContaining({ status: "stopped" }));
        expect(repository.appendRunEvent).toHaveBeenCalledWith(scope, "project-a", "run-a", "run_stopped", {}, "event-stop");
    });

    it("retries only the latest failed items", async () => {
        const repository = {
            getRun: vi.fn().mockResolvedValue({ ...baseRun, status: "partial_failed" }),
            listRunItems: vi.fn().mockResolvedValue(
                [
                    { id: "failed-a", runId: "run-a", itemType: "episode", itemKey: "2", status: "failed", attemptNo: 0 },
                    { id: "ok-a", runId: "run-a", itemType: "episode", itemKey: "1", status: "success", attemptNo: 0 },
                ].filter((item) => item.status === "failed"),
            ),
            createRunItem: vi.fn().mockImplementation((_s, _p, item) => item),
            updateRun: vi.fn(),
            appendRunEvent: vi.fn(),
        };
        const service = new ScriptAgentRunService(repository as never, () => "retry-a");
        const result = await service.retryFailed(scope, "project-a", "run-a");
        expect(result).toHaveLength(1);
        expect(repository.createRunItem).toHaveBeenCalledWith(scope, "project-a", expect.objectContaining({ itemKey: "2", attemptNo: 1, status: "queued" }));
    });
});
