import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn(), schema: vi.fn(), provider: vi.fn(() => "postgres") }));
vi.mock("@/lib/server/database", () => ({
    ensurePostgresSchema: mocks.schema,
    getDatabaseProvider: mocks.provider,
    postgresQuery: mocks.query,
    withPostgresTransaction: async (fn: (client: { query: typeof mocks.query }) => unknown) => fn({ query: mocks.query }),
}));
import { cleanupMediaDiagnostics, persistMediaDiagnostic, resolveMediaDiagnosticContext } from "./media-task-diagnostic-store";
const context = { type: "image" as const, taskId: "task", userId: "owner", surface: "canvas" };
beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockImplementation(async (sql: string) => ({ rows: sql.startsWith("SELECT diagnostic") ? [{ diagnostic_events: [], status: "running" }] : [] }));
});
describe("persistent media diagnostics", () => {
    it("locks the row, authorizes owner and updates only diagnostic columns", async () => {
        await persistMediaDiagnostic(context, { phase: "submit", apiKey: "secret" });
        const calls = mocks.query.mock.calls;
        expect(calls.find(([sql]) => sql.startsWith("SELECT"))?.[0]).toContain("FOR UPDATE");
        const [sql, params] = calls.find(([sql]) => sql.startsWith("UPDATE"))!;
        expect(sql).not.toMatch(/SET (status|payload|updated_at|expires_at|lease_until)/);
        expect(params.slice(0, 3)).toEqual(["task", "image", "owner"]);
        expect(params[3]).not.toContain("secret");
    });
    it("does not propagate storage errors to generation", async () => {
        mocks.query.mockRejectedValue(new Error("database password=private"));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        await expect(persistMediaDiagnostic(context, { phase: "submit" })).resolves.toBeUndefined();
        expect(JSON.stringify(warn.mock.calls)).not.toContain("private");
        warn.mockRestore();
    });
    it("requires matching task owner and channel for proxy correlation", async () => {
        expect(await resolveMediaDiagnosticContext("task", "other", "channel")).toBeUndefined();
        expect(mocks.query.mock.calls[0][1]).toEqual(["task", "other", "channel"]);
        expect(mocks.query.mock.calls[0][0]).toContain("user_id=$2");
    });
    it("cleans expired diagnostics without deleting tasks or media", async () => {
        await cleanupMediaDiagnostics(80);
        const sql = mocks.query.mock.calls[0][0];
        expect(sql).toContain("diagnostic_expires_at<=now()");
        expect(sql).not.toMatch(/DELETE FROM/);
        expect(sql).toContain("diagnostic_events='[]'");
    });
});
