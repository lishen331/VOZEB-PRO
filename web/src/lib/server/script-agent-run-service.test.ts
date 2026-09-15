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

    it("requires every earlier confirmed stage before allowing a later manual stage", async () => {
        const repository = {
            listLatestArtifacts: vi.fn().mockResolvedValue([
                { artifact_type: "creative_positioning", status: "confirmed" },
                { artifact_type: "review_report", status: "confirmed" },
            ]),
            createRun: vi.fn(),
            appendRunEvent: vi.fn(),
        };
        await expect(new ScriptAgentRunService(repository as never).create(scope, { projectId: "project-a", runType: "director_plan", clientRequestId: "missing-upstream" })).rejects.toMatchObject({ status: 409 });
    });

    it("rejects a direct jump to a later stage even when an unrelated artifact exists", async () => {
        const repository = { listLatestArtifacts: vi.fn().mockResolvedValue([{ artifact_type: "creative_positioning", status: "confirmed" }]), createRun: vi.fn(), appendRunEvent: vi.fn() };
        await expect(new ScriptAgentRunService(repository as never).create(scope, { projectId: "project-a", runType: "director_plan", clientRequestId: "jump-director" })).rejects.toMatchObject({ status: 409 });
    });

    it("rejects direct review because review runs inside episode generation", async () => {
        const repository = {
            listLatestArtifacts: vi.fn().mockResolvedValue([{ artifact_type: "episode_scripts", status: "draft" }]),
            createRun: vi.fn().mockResolvedValue({ ...baseRun, runType: "script_review", lastEventSequence: 0 }),
            appendRunEvent: vi.fn(),
        };
        await expect(new ScriptAgentRunService(repository as never, () => "id-a").create(scope, { projectId: "project-a", runType: "script_review", clientRequestId: "review-a" })).rejects.toMatchObject({ status: 409 });
    });

    it("rejects direct prompt extraction because prompts run inside directing", async () => {
        const repository = {
            listLatestArtifacts: vi.fn().mockResolvedValue([{ artifact_type: "text_storyboard", status: "draft" }]),
            createRun: vi.fn().mockResolvedValue({ ...baseRun, runType: "asset_prompts", lastEventSequence: 0 }),
            appendRunEvent: vi.fn(),
        };
        await expect(new ScriptAgentRunService(repository as never, () => "id-a").create(scope, { projectId: "project-a", runType: "asset_prompts", clientRequestId: "assets-a" })).rejects.toMatchObject({ status: 409 });
    });

    it("accepts either a confirmed short story or confirmed long-form chapter outlines for adaptation", async () => {
        for (const artifactType of ["short_story", "chapter_outlines"]) {
            const repository = {
                listLatestArtifacts: vi.fn().mockResolvedValue([
                    { artifact_type: "creative_positioning", status: "confirmed" },
                    { artifact_type: artifactType, status: "confirmed" },
                ]),
                createRun: vi.fn().mockResolvedValue({ ...baseRun, runType: "adaptation_bundle", lastEventSequence: 0 }),
                appendRunEvent: vi.fn(),
            };
            await expect(new ScriptAgentRunService(repository as never, () => "id-a").create(scope, { projectId: "project-a", runType: "adaptation_bundle", clientRequestId: "adapt-" + artifactType })).resolves.toMatchObject({
                runType: "adaptation_bundle",
            });
        }
    });

    it("requires the confirmed adaptation bundle before generating episode scripts", async () => {
        const repository = {
            listLatestArtifacts: vi.fn().mockResolvedValue([
                { artifact_type: "creative_positioning", status: "confirmed" },
                { artifact_type: "short_story", status: "confirmed" },
                { artifact_type: "adaptation_strategy", status: "draft" },
            ]),
            createRun: vi.fn(),
            appendRunEvent: vi.fn(),
        };
        await expect(new ScriptAgentRunService(repository as never).create(scope, { projectId: "project-a", runType: "episode_scripts", clientRequestId: "episodes-draft" })).rejects.toMatchObject({ status: 409 });
        repository.listLatestArtifacts.mockResolvedValue([
            { artifact_type: "creative_positioning", status: "confirmed" },
            { artifact_type: "short_story", status: "confirmed" },
            { artifact_type: "adaptation_strategy", status: "confirmed" },
        ]);
        repository.createRun.mockResolvedValue({ ...baseRun, runType: "episode_scripts", lastEventSequence: 0 });
        await expect(new ScriptAgentRunService(repository as never, () => "id-a").create(scope, { projectId: "project-a", runType: "episode_scripts", clientRequestId: "episodes-confirmed" })).resolves.toMatchObject({ runType: "episode_scripts" });
    });

    it("requires a saved episode script before automatic review", async () => {
        const repository = { listLatestArtifacts: vi.fn().mockResolvedValue([]), createRun: vi.fn(), appendRunEvent: vi.fn() };
        await expect(new ScriptAgentRunService(repository as never).create(scope, { projectId: "project-a", runType: "script_review", clientRequestId: "review-empty" })).rejects.toMatchObject({ status: 409 });
    });

    it("requires confirmed review and a saved director plan before text storyboarding", async () => {
        const repository = {
            listLatestArtifacts: vi.fn().mockResolvedValue([
                { artifact_type: "creative_positioning", status: "confirmed" },
                { artifact_type: "short_story", status: "confirmed" },
                { artifact_type: "adaptation_strategy", status: "confirmed" },
                { artifact_type: "episode_scripts", status: "draft" },
            ]),
            createRun: vi.fn(),
            appendRunEvent: vi.fn(),
        };
        await expect(new ScriptAgentRunService(repository as never).create(scope, { projectId: "project-a", runType: "text_storyboard", clientRequestId: "board-a" })).rejects.toMatchObject({ status: 409 });
        repository.listLatestArtifacts.mockResolvedValue([
            { artifact_type: "creative_positioning", status: "confirmed" },
            { artifact_type: "short_story", status: "confirmed" },
            { artifact_type: "adaptation_strategy", status: "confirmed" },
            { artifact_type: "episode_scripts", status: "draft" },
            { artifact_type: "review_report", status: "confirmed" },
            { artifact_type: "director_plan", status: "draft" },
        ]);
        repository.createRun.mockResolvedValue({ ...baseRun, runType: "text_storyboard", lastEventSequence: 0 });
        await expect(new ScriptAgentRunService(repository as never, () => "id-a").create(scope, { projectId: "project-a", runType: "text_storyboard", clientRequestId: "board-b" })).rejects.toMatchObject({ status: 409 });
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

describe("ScriptAgentRunService regeneration", () => {
    it("allows regenerating the awaiting current artifact with user feedback", async () => {
        const repository = {
            listLatestArtifacts: vi.fn().mockResolvedValue([{ id: "artifact-a", artifact_type: "short_story", status: "awaiting_review" }]),
            createRun: vi.fn().mockResolvedValue({ ...baseRun, runType: "short_story", lastEventSequence: 0 }),
            createRunItem: vi.fn().mockResolvedValue({ id: "item-a" }),
            appendRunEvent: vi.fn(),
        };
        await expect(
            new ScriptAgentRunService(repository as never, () => "id-a").create(scope, {
                projectId: "project-a",
                runType: "short_story",
                clientRequestId: "regenerate-a",
                configSnapshot: { regeneration: { artifactId: "artifact-a", stageKey: "short_story", feedback: "增加陶艺体验" } },
            }),
        ).resolves.toMatchObject({ runType: "short_story" });
    });

    it("allows regenerating awaiting episode scripts with user feedback", async () => {
        const repository = {
            listLatestArtifacts: vi.fn().mockResolvedValue([{ id: "artifact-a", artifact_type: "episode_scripts", status: "awaiting_review" }]),
            createRun: vi.fn().mockResolvedValue({ ...baseRun, runType: "episode_scripts", lastEventSequence: 0 }),
            createRunItem: vi.fn().mockResolvedValue({ id: "item-a" }),
            appendRunEvent: vi.fn(),
        };
        await expect(
            new ScriptAgentRunService(repository as never, () => "id-a").create(scope, {
                projectId: "project-a",
                runType: "episode_scripts",
                clientRequestId: "regenerate-episode-a",
                configSnapshot: { regeneration: { artifactId: "artifact-a", stageKey: "episode_scripts", feedback: "加快第二幕节奏" } },
            }),
        ).resolves.toMatchObject({ runType: "episode_scripts" });
    });

    it("rejects regeneration for a different or already confirmed artifact", async () => {
        const repository = {
            listLatestArtifacts: vi.fn().mockResolvedValue([{ id: "artifact-a", artifact_type: "short_story", status: "confirmed" }]),
            createRun: vi.fn(),
            appendRunEvent: vi.fn(),
        };
        await expect(
            new ScriptAgentRunService(repository as never).create(scope, {
                projectId: "project-a",
                runType: "short_story",
                clientRequestId: "regenerate-b",
                configSnapshot: { regeneration: { artifactId: "artifact-a", stageKey: "short_story", feedback: "修改" } },
            }),
        ).rejects.toMatchObject({ status: 409 });
        expect(repository.createRun).not.toHaveBeenCalled();
    });

    it("rejects regeneration when the run type does not match the artifact stage", async () => {
        const repository = {
            listLatestArtifacts: vi.fn().mockResolvedValue([{ id: "artifact-a", artifact_type: "short_story", status: "awaiting_review" }]),
            createRun: vi.fn().mockResolvedValue({ ...baseRun, runType: "project_planning", lastEventSequence: 0 }),
            createRunItem: vi.fn(),
            appendRunEvent: vi.fn(),
        };
        await expect(
            new ScriptAgentRunService(repository as never).create(scope, {
                projectId: "project-a",
                runType: "project_planning",
                clientRequestId: "regenerate-c",
                configSnapshot: { regeneration: { artifactId: "artifact-a", stageKey: "short_story", feedback: "修改" } },
            }),
        ).rejects.toMatchObject({ status: 409 });
        expect(repository.createRun).not.toHaveBeenCalled();
    });
});

describe("ScriptAgentRunService confirmation-triggered stages", () => {
    it("allows the automatic next stage only when created by a user confirmation", async () => {
        const repository = {
            listLatestArtifacts: vi.fn().mockResolvedValue([
                { artifact_type: "creative_positioning", status: "confirmed" },
                { artifact_type: "short_story", status: "confirmed" },
                { artifact_type: "adaptation_strategy", status: "confirmed" },
                { artifact_type: "episode_scripts", status: "confirmed" },
            ]),
            createRun: vi.fn().mockResolvedValue({ ...baseRun, runType: "script_review", lastEventSequence: 0 }),
            createRunItem: vi.fn().mockResolvedValue({ id: "item-a" }),
            appendRunEvent: vi.fn(),
        };
        await expect(
            new ScriptAgentRunService(repository as never, () => "id-a").createAfterConfirmation(scope, {
                projectId: "project-a",
                runType: "script_review",
                clientRequestId: "confirmed-next",
                configSnapshot: { confirmedStageKey: "episode_scripts" },
            }),
        ).resolves.toMatchObject({ runType: "script_review" });
    });
});
