import { describe, expect, it, vi } from "vitest";
import type { QueryExecutor } from "./postgres";
import { ScriptAgentRepository } from "./script-agent-repository";

const scope = { schoolId: "school-a", ownerUserId: "user-a" };
function repository(rows: Record<string, unknown>[] = []) {
    const query = vi.fn().mockResolvedValue({ rows, rowCount: rows.length });
    return { query, repository: new ScriptAgentRepository({ query } as unknown as QueryExecutor) };
}

describe("ScriptAgentRepository", () => {
    it("creates an idempotent tenant-scoped run", async () => {
        const { query, repository: repo } = repository([
            {
                id: "run-a",
                school_id: "school-a",
                owner_user_id: "user-a",
                project_id: "project-a",
                run_type: "short_story",
                status: "planning",
                client_request_id: "request-a",
                config_snapshot: {},
                progress_json: {},
                last_event_sequence: 0,
                created_at: "2026-09-13T00:00:00Z",
            },
        ]);
        await repo.createRun(scope, { id: "run-a", projectId: "project-a", runType: "short_story", clientRequestId: "request-a", configSnapshot: {} });
        expect(query).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT (school_id, owner_user_id, client_request_id)"), expect.arrayContaining(["run-a", "school-a", "user-a", "project-a", "request-a"]));
    });

    it("scopes an idempotent request conflict to the same project and run type", async () => {
        const { query, repository: repo } = repository([]);
        await repo.createRun(scope, { id: "run-new", projectId: "project-b", runType: "text_storyboard", clientRequestId: "request-a", configSnapshot: {} });
        expect(query).toHaveBeenCalledWith(expect.stringContaining("WHERE practice_script_runs.project_id = EXCLUDED.project_id AND practice_script_runs.run_type = EXCLUDED.run_type"), expect.any(Array));
    });

    it("returns null instead of throwing when a legacy or foreign project cannot create a scoped run", async () => {
        const { repository: repo } = repository([]);
        await expect(repo.createRun(scope, { id: "run-a", projectId: "legacy-project", runType: "short_story", clientRequestId: "request-a", configSnapshot: {} })).resolves.toBeNull();
    });

    it("uses an atomic increment before appending a public event", async () => {
        const { query, repository: repo } = repository([{ id: "event-a", run_id: "run-a", sequence: 4, public_event_type: "artifact_saved", public_payload: { artifactId: "artifact-a" }, created_at: "2026-09-13T00:00:00Z" }]);
        await repo.appendRunEvent(scope, "project-a", "run-a", "artifact_saved", { artifactId: "artifact-a" }, "event-a");
        expect(query).toHaveBeenCalledWith(expect.stringMatching(/UPDATE practice_script_runs[\s\S]+last_event_sequence = last_event_sequence \+ 1[\s\S]+INSERT INTO practice_script_run_events/), [
            "event-a",
            "run-a",
            "school-a",
            "user-a",
            "project-a",
            "artifact_saved",
            JSON.stringify({ artifactId: "artifact-a" }),
        ]);
    });

    it("qualifies run item timestamps when updating through the Run join", async () => {
        const { query, repository: repo } = repository([]);
        await repo.updateRunItem(scope, "project-a", "run-a", "item-a", { status: "running" });
        expect(query).toHaveBeenCalledWith(expect.stringContaining("i.started_at = CASE"), expect.any(Array));
        expect(query.mock.calls[0]?.[0]).toContain("i.completed_at = CASE");
        expect(query.mock.calls[0]?.[0]).toContain("RETURNING i.*");
    });

    it("updates an existing episode when the script phase follows the outline phase", async () => {
        const { query, repository: repo } = repository([]);
        await repo.replaceEpisodes(scope, "project-a", "run-script", [{ episodeNumber: 1, title: "第一集", script: { blocks: [] } }]);
        expect(query).toHaveBeenCalledWith(expect.stringContaining("ON CONFLICT (project_id, episode_number, version) DO UPDATE"), expect.any(Array));
    });

    it("upserts storyboard shots and prompt assets when retrying a partially saved stage", async () => {
        const { query, repository: repo } = repository([]);
        await repo.replaceShots(scope, "project-a", "run-retry", [
            {
                id: "shot-a",
                episodeId: "episode-a",
                sceneId: "scene-a",
                shotNumber: 1,
                visualDescription: "推门",
                shotSize: "中景",
                cameraAngle: "平视",
                composition: "居中",
                cameraMovement: "推进",
                action: "推门",
                emotion: "坚定",
                durationSeconds: 3,
            },
        ]);
        await repo.upsertPromptAssets(scope, "project-a", "run-retry", [{ assetType: "character", canonicalName: "女主", basePrompt: "都市女性", aliases: [], variants: [] }]);
        expect(query.mock.calls.at(-2)?.[0]).toContain("ON CONFLICT (episode_id, scene_id, shot_number, version) DO UPDATE");
        expect(query.mock.calls.at(-1)?.[0]).toContain("ON CONFLICT (project_id, asset_type, canonical_name, version) DO UPDATE");
    });

    it("resolves storyboard episode numbers to persisted episode ids", async () => {
        const query = vi
            .fn()
            .mockResolvedValueOnce({ rows: [{ id: "episode-db-1" }], rowCount: 1 })
            .mockResolvedValue({ rows: [], rowCount: 0 });
        const repo = new ScriptAgentRepository({ query } as unknown as QueryExecutor);
        await repo.replaceStoryboardEpisodes(scope, "project-a", "run-board", [
            {
                episodeNumber: 1,
                shots: [
                    {
                        sceneId: "scene-1",
                        shotNumber: 1,
                        visualDescription: "门被推开",
                        shotSize: "近景",
                        cameraAngle: "平视",
                        composition: "居中",
                        cameraMovement: "固定",
                        characterIds: [],
                        action: "回头",
                        emotion: "警惕",
                        durationSeconds: 3,
                        characterAssetIds: [],
                        propAssetIds: [],
                    },
                ],
            },
        ]);
        expect(query).toHaveBeenNthCalledWith(1, expect.stringContaining("episode_number = $4"), ["school-a", "user-a", "project-a", 1]);
        expect(query).toHaveBeenNthCalledWith(2, expect.stringContaining("INSERT INTO practice_script_shots"), expect.arrayContaining(["episode-db-1"]));
    });

    it("lists artifacts already saved by the same Run for failed-chain resume", async () => {
        const { query, repository: repo } = repository([{ artifact_type: "director_plan" }, { artifact_type: "text_storyboard" }]);
        await expect(repo.listRunArtifactTypes(scope, "project-a", "run-a")).resolves.toEqual(["director_plan", "text_storyboard"]);
        expect(query).toHaveBeenCalledWith(expect.stringContaining("source_run_id = $4"), ["school-a", "user-a", "project-a", "run-a"]);
    });

    it("reads one requested artifact without loading the project artifact snapshot", async () => {
        const { query, repository: repo } = repository([]);
        await repo.getLatestArtifact(scope, "project-a", "creative_positioning", "project");
        expect(query).toHaveBeenCalledWith(expect.stringContaining("artifact_type = $4 AND artifact_key = $5"), ["school-a", "user-a", "project-a", "creative_positioning", "project"]);
        expect(query.mock.calls[0]?.[0]).toContain("LIMIT 1");
    });

    it("replays only events after the requested sequence", async () => {
        const { query, repository: repo } = repository([]);
        await repo.listRunEvents(scope, "project-a", "run-a", 8, 200);
        expect(query).toHaveBeenCalledWith(expect.stringContaining("sequence > $6"), ["run-a", "school-a", "user-a", "project-a", 200, 8]);
    });

    it("selects only failed items for retry", async () => {
        const { query, repository: repo } = repository([]);
        await repo.listRunItems(scope, "project-a", "run-a", "failed");
        expect(query).toHaveBeenCalledWith(expect.stringContaining("i.status = $5"), ["run-a", "school-a", "user-a", "project-a", "failed"]);
    });

    it("freshly reads an enabled agent profile without a process cache", async () => {
        const { query, repository: repo } = repository([]);
        await repo.getAgentProfile("novel_writer");
        await repo.getAgentProfile("novel_writer");
        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[0]?.[0]).not.toContain("enabled = true");
    });
});
