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
        const repository = { createRun: vi.fn().mockResolvedValue(baseRun), createRunItem: vi.fn().mockResolvedValue({ id: "item-a" }), appendRunEvent: vi.fn().mockResolvedValue({ sequence: 1 }) };
        const service = new ScriptAgentRunService(repository as never, () => "id-a");
        await service.create(scope, { projectId: "project-a", runType: "short_story", clientRequestId: "request-a" });
        expect(repository.createRun).toHaveBeenCalledOnce();
        expect(repository.createRunItem).toHaveBeenCalledWith(scope, "project-a", expect.objectContaining({ runId: "run-a", itemType: "run", itemKey: "main", status: "queued", attemptNo: 0 }));
        expect(repository.appendRunEvent).toHaveBeenCalledWith(scope, "project-a", "run-a", "run_started", expect.objectContaining({ runType: "short_story" }), "id-a");
    });

    it("allows automatic review from a saved episode script without a user confirmation", async () => {
        const repository = {
            listLatestArtifacts: vi.fn().mockResolvedValue([{ artifact_type: "episode_scripts", status: "draft" }]),
            createRun: vi.fn().mockResolvedValue({ ...baseRun, runType: "script_review", lastEventSequence: 0 }),
            appendRunEvent: vi.fn(),
        };
        await expect(new ScriptAgentRunService(repository as never, () => "id-a").create(scope, { projectId: "project-a", runType: "script_review", clientRequestId: "review-a" })).resolves.toMatchObject({ runType: "script_review" });
    });

    it("allows prompt extraction from a saved textual storyboard", async () => {
        const repository = {
            listLatestArtifacts: vi.fn().mockResolvedValue([{ artifact_type: "text_storyboard", status: "draft" }]),
            createRun: vi.fn().mockResolvedValue({ ...baseRun, runType: "asset_prompts", lastEventSequence: 0 }),
            appendRunEvent: vi.fn(),
        };
        await expect(new ScriptAgentRunService(repository as never, () => "id-a").create(scope, { projectId: "project-a", runType: "asset_prompts", clientRequestId: "assets-a" })).resolves.toMatchObject({ runType: "asset_prompts" });
    });

    it("accepts either a confirmed short story or confirmed long-form chapter outlines for adaptation", async () => {
        for (const artifactType of ["short_story", "chapter_outlines"]) {
            const repository = {
                listLatestArtifacts: vi.fn().mockResolvedValue([{ artifact_type: artifactType, status: "confirmed" }]),
                createRun: vi.fn().mockResolvedValue({ ...baseRun, runType: "adaptation_bundle", lastEventSequence: 0 }),
                appendRunEvent: vi.fn(),
            };
            await expect(new ScriptAgentRunService(repository as never, () => "id-a").create(scope, { projectId: "project-a", runType: "adaptation_bundle", clientRequestId: "adapt-" + artifactType })).resolves.toMatchObject({
                runType: "adaptation_bundle",
            });
        }
    });

    it("requires a saved episode script before automatic review", async () => {
        const repository = { listLatestArtifacts: vi.fn().mockResolvedValue([]), createRun: vi.fn(), appendRunEvent: vi.fn() };
        await expect(new ScriptAgentRunService(repository as never).create(scope, { projectId: "project-a", runType: "script_review", clientRequestId: "review-empty" })).rejects.toMatchObject({ status: 409 });
    });

    it("requires confirmed review and a saved director plan before text storyboarding", async () => {
        const repository = { listLatestArtifacts: vi.fn().mockResolvedValue([{ artifact_type: "review_report", status: "confirmed" }]), createRun: vi.fn(), appendRunEvent: vi.fn() };
        await expect(new ScriptAgentRunService(repository as never).create(scope, { projectId: "project-a", runType: "text_storyboard", clientRequestId: "board-a" })).rejects.toMatchObject({ status: 409 });
        repository.listLatestArtifacts.mockResolvedValue([
            { artifact_type: "review_report", status: "confirmed" },
            { artifact_type: "director_plan", status: "draft" },
        ]);
        repository.createRun.mockResolvedValue({ ...baseRun, runType: "text_storyboard", lastEventSequence: 0 });
        await expect(new ScriptAgentRunService(repository as never, () => "id-a").create(scope, { projectId: "project-a", runType: "text_storyboard", clientRequestId: "board-b" })).resolves.toMatchObject({ runType: "text_storyboard" });
    });

    it("requires a saved textual storyboard before prompt extraction", async () => {
        const repository = { listLatestArtifacts: vi.fn().mockResolvedValue([]), createRun: vi.fn(), appendRunEvent: vi.fn() };
        await expect(new ScriptAgentRunService(repository as never).create(scope, { projectId: "project-a", runType: "asset_prompts", clientRequestId: "assets-a" })).rejects.toMatchObject({ status: 409 });
    });

    it("maps a zero-row scoped insert to a project-not-found error", async () => {
        const repository = { createRun: vi.fn().mockResolvedValue(null), appendRunEvent: vi.fn() };
        const service = new ScriptAgentRunService(repository as never, () => "id-a");
        await expect(service.create(scope, { projectId: "legacy-project", runType: "project_planning", clientRequestId: "request-a" })).rejects.toMatchObject({ status: 404 });
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
