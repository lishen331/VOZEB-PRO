import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ query: vi.fn(), ready: vi.fn() }));
vi.mock("@/lib/server/database", () => ({ ensurePostgresSchema: db.ready, getDatabaseProvider: () => "postgres", postgresQuery: db.query }));
import { getReversePromptHistory, listReversePromptHistory, readReversePromptHistoryCursor } from "./practice-reverse-prompt-history-store";

const scope = { userId: "student", schoolId: "school" };
const row = {
    id: "task-one",
    created_at: new Date(0),
    updated_at: new Date(0),
    analysis_mode: "detail",
    extra_requirement: "light",
    analysis_text: "detail text",
    trial_status: "failed",
    success_id: "task-old",
    success_prompt: "old submitted prompt",
    success_asset_key: "permanent/image.png",
    success_asset_scope: "generation",
};

describe("reverse prompt history reads", () => {
    beforeEach(() => vi.clearAllMocks());
    it("bases detail on both scopes and preserves the last successful image and its prompt after a failed retry", async () => {
        db.query.mockResolvedValue({ rows: [row] });
        expect(await getReversePromptHistory(scope, "task-one")).toMatchObject({ trialStatus: "failed", trial: { prompt: "old submitted prompt", image: { url: "/api/generation-log-assets/permanent/image.png" } } });
        expect(db.query).toHaveBeenCalledWith(expect.stringContaining("h.user_id = $1 AND h.school_id = $2"), ["student", "school", "task-one"]);
    });
    it("does not return a URL for an unregistered image and never mutates on read", async () => {
        db.query.mockResolvedValue({ rows: [{ ...row, success_asset_key: null }] });
        expect((await listReversePromptHistory(scope, null)).records[0].trial).toBeUndefined();
        expect(db.query.mock.calls.every(([sql]) => sql.startsWith("SELECT"))).toBe(true);
    });
    it("keeps PostgreSQL timestamp precision for cursor pagination", () => {
        expect(readReversePromptHistoryCursor("2026-11-26T01:02:03.000421Z:task-one")).toEqual({ at: "2026-11-26T01:02:03.000421Z", id: "task-one" });
        expect(readReversePromptHistoryCursor("invalid")).toBeNull();
    });
});
