import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    records: [] as Array<Record<string, unknown>>,
    provider: "file" as "file" | "postgres",
    postgresQuery: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    ensurePostgresSchema: vi.fn(),
    getDatabaseProvider: vi.fn(() => mocks.provider),
    postgresQuery: mocks.postgresQuery,
    withPostgresTransaction: vi.fn(),
}));
vi.mock("@/lib/server/data-adapter", () => ({
    readJsonDataFile: vi.fn(async () => structuredClone(mocks.records)),
    withJsonDataFileLock: vi.fn(),
    writeJsonDataFile: vi.fn(),
}));

import { listStoredDramaProjectTaskRecords, listStoredDramaTaskRecords } from "./generation-task-store";

describe("listStoredDramaTaskRecords", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.provider = "file";
        mocks.records = [];
    });

    it("returns only unexpired video tasks with the exact Drama Lab coordinate tuple", async () => {
        const now = Date.now();
        mocks.records = [
            record("newer", { surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", attemptNo: 2 }, now + 20),
            record("older", { surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", attemptNo: 1 }, now + 10),
            record("wrong-user", { userId: "other", surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one" }, now + 30),
            record("wrong-project", { surface: "drama", projectId: "project-two", episodeId: "episode-one", shotId: "shot-one" }, now + 40),
            record("wrong-episode", { surface: "drama", projectId: "project-one", episodeId: "episode-two", shotId: "shot-one" }, now + 50),
            record("wrong-surface", { surface: "canvas", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one" }, now + 60),
            record("partial", { surface: "drama", projectId: "project-one", episodeId: "episode-one" }, now + 70),
            record("expired", { surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one" }, now - 1),
            { ...record("image", { surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one" }, now + 80), type: "image" },
        ];

        const result = await listStoredDramaTaskRecords({ userId: "user-one", projectId: "project-one", episodeId: "episode-one", shotIds: ["shot-one"] });

        expect(result.map((task) => task.id)).toEqual(["newer", "older"]);
    });

    it("does not query PostgreSQL when the current episode has no shots", async () => {
        mocks.provider = "postgres";

        await expect(listStoredDramaTaskRecords({ userId: "user-one", projectId: "project-one", episodeId: "episode-one", shotIds: [] })).resolves.toEqual([]);
        expect(mocks.postgresQuery).not.toHaveBeenCalled();
    });

    it("pushes owner, project, episode, shot and expiry constraints into PostgreSQL", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValueOnce({ rows: [] });

        await listStoredDramaTaskRecords({ userId: "user-one", projectId: "project-one", episodeId: "episode-one", shotIds: ["shot-one", "shot-two"], limit: 37 });

        const [statement, params] = mocks.postgresQuery.mock.calls[0] || [];
        expect(String(statement)).toContain("COALESCE(NULLIF(BTRIM(surface), ''), NULLIF(BTRIM(payload->>'surface'), ''), NULLIF(BTRIM(payload#>>'{context,surface}'), '')) = 'drama'");
        expect(String(statement)).toContain("COALESCE(NULLIF(BTRIM(project_id), ''), NULLIF(BTRIM(payload->>'projectId'), ''), NULLIF(BTRIM(payload#>>'{context,projectId}'), '')) = $3");
        expect(String(statement)).toContain("payload->>'episodeId'");
        expect(String(statement)).toContain("payload->>'shotId'");
        expect(String(statement)).toContain("BTRIM(surface)");
        expect(String(statement)).toContain("Apply the same source-agreement rule in SQL before LIMIT");
        expect(String(statement)).toContain("NULLIF(BTRIM(surface), '') IS NULL OR");
        expect(String(statement)).toContain("expires_at > now()");
        expect(String(statement)).toContain("ORDER BY COALESCE(");
        expect(String(statement)).toContain("NULLIF(BTRIM(payload->>'attemptNo'), '')::integer");
        expect(params).toEqual(["user-one", "video", "project-one", "episode-one", ["shot-one", "shot-two"], 37]);
    });

    it("discovers PostgreSQL rows whose Drama Lab context exists only in payload or payload.context", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValueOnce({
            rows: [
                postgresRecord("payload-only", { surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", attemptNo: 3 }),
                postgresRecord("nested-only", { context: { surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-two", attemptNo: 2 } }),
            ],
        });

        const result = await listStoredDramaTaskRecords({ userId: "user-one", projectId: "project-one", episodeId: "episode-one", shotIds: ["shot-one", "shot-two"] });

        expect(result.map((task) => task.id)).toEqual(["payload-only", "nested-only"]);
        expect(result[0]).toMatchObject({ surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", attemptNo: 3 });
        expect(result[1]).toMatchObject({ surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-two", attemptNo: 2 });
    });

    it("rejects PostgreSQL rows when durable columns conflict with payload coordinates", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValueOnce({
            rows: [
                postgresRecord("surface-conflict", { context: { surface: "canvas", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one" } }, { surface: "drama", projectId: "project-one" }),
                postgresRecord("project-conflict", { context: { surface: "drama", projectId: "project-two", episodeId: "episode-one", shotId: "shot-two" } }, { surface: "drama", projectId: "project-one" }),
            ],
        });

        await expect(listStoredDramaTaskRecords({ userId: "user-one", projectId: "project-one", episodeId: "episode-one", shotIds: ["shot-one", "shot-two"] })).resolves.toEqual([]);
    });

    it("accepts file records whose context is nested under payload.context", async () => {
        const now = Date.now();
        mocks.records = [record("nested", {}, now + 100, { context: { surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one" } })];

        await expect(listStoredDramaTaskRecords({ userId: "user-one", projectId: "project-one", episodeId: "episode-one", shotIds: ["shot-one"] })).resolves.toMatchObject([{ id: "nested", episodeId: "episode-one", shotId: "shot-one", surface: "drama" }]);
    });

    it("normalizes padded context consistently for the file provider", async () => {
        const now = Date.now();
        mocks.records = [record("padded", { surface: " drama ", projectId: " project-one ", episodeId: " episode-one ", shotId: " shot-one " }, now + 100, { userId: " user-one " })];

        await expect(listStoredDramaTaskRecords({ userId: "user-one", projectId: "project-one", episodeId: "episode-one", shotIds: ["shot-one"] })).resolves.toMatchObject([
            { id: "padded", userId: "user-one", surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one" },
        ]);
    });

    it("rejects an invalid top-level surface even when payload fallback looks valid", async () => {
        const now = Date.now();
        mocks.records = [record("invalid-surface", { surface: "canvas-layer", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one" }, now + 100, { surface: "drama" })];

        await expect(listStoredDramaTaskRecords({ userId: "user-one", projectId: "project-one", episodeId: "episode-one", shotIds: ["shot-one"] })).resolves.toEqual([]);
    });

    it("keeps source agreement in the PostgreSQL query so conflicts cannot consume the limit", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValueOnce({ rows: [] });

        await listStoredDramaTaskRecords({ userId: "user-one", projectId: "project-one", episodeId: "episode-one", shotIds: ["shot-one"], limit: 1 });

        const statement = String(mocks.postgresQuery.mock.calls[0]?.[0]);
        const agreementIndex = statement.indexOf("Apply the same source-agreement rule in SQL before LIMIT");
        const limitIndex = statement.indexOf("LIMIT $6");
        expect(agreementIndex).toBeGreaterThan(-1);
        expect(limitIndex).toBeGreaterThan(agreementIndex);
        expect(statement).toContain("payload#>>'{context,projectId}'");
        expect(statement).toContain("payload#>>'{context,shotId}'");
    });
});

describe("listStoredDramaProjectTaskRecords", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.provider = "file";
        mocks.records = [];
    });

    it("discovers legacy project tasks whose context only exists in the payload", async () => {
        const expiresAt = Date.now() + 60_000;
        mocks.records = [
            {
                id: "legacy-story",
                userId: "user-one",
                type: "text",
                status: "success",
                payload: {
                    id: "legacy-story",
                    userId: "user-one",
                    status: "success",
                    surface: "drama",
                    storyBatch: { projectId: "project-one", sourceEpisodeId: "episode-one", status: "persisting" },
                },
                createdAt: expiresAt - 2_000,
                updatedAt: expiresAt - 1_000,
                expiresAt,
            },
            {
                id: "other-project",
                userId: "user-one",
                type: "text",
                status: "success",
                payload: { surface: "drama", storyBatch: { projectId: "project-two", status: "persisting" } },
                createdAt: expiresAt - 2_000,
                updatedAt: expiresAt - 1_000,
                expiresAt,
            },
        ];

        await expect(listStoredDramaProjectTaskRecords({ userId: "user-one", projectId: "project-one", types: ["text"] })).resolves.toMatchObject([{ id: "legacy-story", surface: "drama", projectId: "project-one", episodeId: "episode-one" }]);
    });

    it("uses payload fallbacks and project context agreement in PostgreSQL", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValueOnce({ rows: [] });

        await listStoredDramaProjectTaskRecords({ userId: "user-one", projectId: "project-one", types: ["text", "video"], limit: 11 });

        const [statement, params] = mocks.postgresQuery.mock.calls[0] || [];
        expect(String(statement)).toContain("task_type = ANY($2::text[])");
        expect(String(statement)).toContain("payload#>>'{storyBatch,projectId}'");
        expect(String(statement)).toContain("payload#>>'{workflow,projectId}'");
        expect(String(statement)).toContain("expires_at > now()");
        expect(params).toEqual(["user-one", ["text", "video"], "project-one", 11]);
    });
});

function record(id: string, context: Record<string, unknown>, expiresAt: number, payloadExtra: Record<string, unknown> = {}) {
    const userId = typeof context.userId === "string" ? context.userId : "user-one";
    const payload = { id, userId, status: "running", ...context, ...payloadExtra };
    return {
        id,
        userId,
        type: "video",
        status: "running",
        surface: context.surface,
        projectId: context.projectId,
        episodeId: context.episodeId,
        shotId: context.shotId,
        attemptNo: context.attemptNo,
        payload,
        createdAt: expiresAt - 10_000,
        updatedAt: expiresAt - 5_000,
        expiresAt,
        executionPhase: "polling",
        nextPollAt: expiresAt - 4_000,
    };
}

function postgresRecord(id: string, payload: Record<string, unknown>, durable: { surface?: string; projectId?: string } = {}) {
    const now = new Date("2026-09-01T00:00:00.000Z");
    return {
        id,
        user_id: "user-one",
        task_type: "video",
        status: "running",
        payload: { id, userId: "user-one", status: "running", ...payload },
        created_at: now,
        updated_at: now,
        expires_at: new Date("2099-01-01T00:00:00.000Z"),
        surface: durable.surface ?? null,
        project_id: durable.projectId ?? null,
        attempt_no: null,
        execution_phase: "polling",
        next_poll_at: new Date("2026-09-01T00:00:01.000Z"),
    };
}
