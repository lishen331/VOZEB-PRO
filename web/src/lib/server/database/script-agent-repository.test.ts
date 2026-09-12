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
    });
});
