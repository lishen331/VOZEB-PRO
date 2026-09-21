import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ rows: [] as unknown[], provider: "json", query: vi.fn() }));
vi.mock("./database", () => ({ getDatabaseProvider: () => state.provider, ensurePostgresSchema: vi.fn(), postgresQuery: state.query }));
vi.mock("./data-adapter", () => ({
    readJsonDataFile: vi.fn(async () => state.rows),
    writeJsonDataFile: vi.fn(async (_name, rows) => {
        state.rows = rows;
    }),
    withJsonDataFileLock: vi.fn(async (_name, fn) => fn()),
}));
import { getProtocolAnalysisHistory, recordProtocolAnalysis, sanitizeProtocolHistory } from "./protocol-analysis-history";
beforeEach(() => {
    state.rows = [];
    state.provider = "json";
    vi.clearAllMocks();
});
describe("protocol history", () => {
    it("redacts credential fields recursively but retains protocol structure", () => {
        expect(sanitizeProtocolHistory({ apiKey: "private", result: { createPath: "/video/submit", token: "secret", Authorization: "Bearer hidden", access_token: "hidden" } })).toEqual({
            apiKey: "[REDACTED]",
            result: { createPath: "/video/submit", token: "[REDACTED]", Authorization: "[REDACTED]", access_token: "[REDACTED]" },
        });
    });
    it("persists inputs and success before a failure, isolates channel/model and removes pasted keys", async () => {
        await recordProtocolAnalysis({ channelId: "a", model: "models/VIDEO", input: { examples: "Authorization: Bearer sk-abcdefghijk" }, result: { drafts: [], warnings: [], sourcePages: 1 } });
        await recordProtocolAnalysis({ channelId: "a", model: "VIDEO", input: { documentationText: "new input" }, error: "sk-abcdefghijk failed" });
        await recordProtocolAnalysis({ channelId: "b", model: "video", input: {} });
        await recordProtocolAnalysis({ channelId: "a", model: "other", input: {} });
        const rows = await getProtocolAnalysisHistory("a", "models/VIDEO");
        expect(rows).toHaveLength(2);
        expect(rows.some((row) => row.result)).toBe(true);
        expect(rows.some((row) => row.error)).toBe(true);
        expect(JSON.stringify(rows)).not.toContain("sk-abcdefghijk");
    });
    it("uses bound SQL parameters for scope and sanitizes old records on read", async () => {
        state.provider = "postgres";
        state.query.mockResolvedValue({ rows: [{ payload: { input: { examples: "api_key=old-secret" } } }] });
        const rows = await getProtocolAnalysisHistory("channel", "models/VIDEO");
        expect(state.query).toHaveBeenCalledWith(expect.stringContaining("WHERE channel_id=$1 AND model=$2"), ["channel", "video"]);
        expect(JSON.stringify(rows)).not.toContain("old-secret");
    });
});
