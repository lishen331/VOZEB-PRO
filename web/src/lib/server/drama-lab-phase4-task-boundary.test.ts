import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    provider: "file" as "file" | "postgres",
    records: [] as Array<Record<string, unknown>>,
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

import { listStoredDramaTaskRecords, queryStoredGenerationTasks } from "./generation-task-store";

describe("Drama Lab Phase 4 generation-task boundary", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.provider = "file";
        mocks.records = [];
    });

    it("discovers only the caller's Drama tasks for the requested project", async () => {
        const expiresAt = Date.now() + 60_000;
        mocks.records = [
            task("drama-one", "user-one", { surface: "drama", projectId: "drama-project", episodeId: "episode-one", shotId: "shot-one" }, expiresAt),
            task("ordinary-canvas", "user-one", { surface: "canvas", projectId: "drama-project" }, expiresAt),
            task("other-drama-project", "user-one", { surface: "drama", projectId: "other-project", episodeId: "episode-one", shotId: "shot-one" }, expiresAt),
            task("foreign-user", "user-two", { surface: "drama", projectId: "drama-project", episodeId: "episode-one", shotId: "shot-one" }, expiresAt),
            task("expired", "user-one", { surface: "drama", projectId: "drama-project", episodeId: "episode-one", shotId: "shot-two" }, Date.now() - 1),
        ];

        const result = await queryStoredGenerationTasks<Record<string, unknown>>("video", {
            userId: "user-one",
            surface: "drama",
            projectId: "drama-project",
            statuses: ["running"],
            limit: 20,
        });

        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({ id: "drama-one", surface: "drama", projectId: "drama-project" });
    });

    it("pushes user, surface, project and status predicates into the PostgreSQL query", async () => {
        mocks.provider = "postgres";
        mocks.postgresQuery.mockResolvedValue({ rows: [] });

        await queryStoredGenerationTasks("video", {
            userId: "user-one",
            surface: "drama",
            projectId: "drama-project",
            statuses: ["running", "success"],
            limit: 7,
        });

        const [sql, params] = mocks.postgresQuery.mock.calls[0] || [];
        expect(String(sql)).toContain("user_id = $1");
        expect(String(sql)).toContain("task_type = $2");
        expect(String(sql)).toContain("project_id = $3");
        expect(String(sql)).toContain("surface = $4");
        expect(String(sql)).toContain("status = ANY($5::text[])");
        expect(String(sql)).toContain("LIMIT $6");
        expect(params).toEqual(["user-one", "video", "drama-project", "drama", ["running", "success"], 7]);
    });

    it("does not query or recover a Drama task when the complete shot scope is absent", async () => {
        mocks.provider = "postgres";

        await expect(listStoredDramaTaskRecords({ userId: "user-one", projectId: "drama-project", episodeId: "episode-one", shotIds: [] })).resolves.toEqual([]);
        expect(mocks.postgresQuery).not.toHaveBeenCalled();
    });
});

function task(id: string, userId: string, context: Record<string, unknown>, expiresAt: number) {
    const payload = { id, userId, status: "running", ...context };
    return {
        id,
        userId,
        type: "video",
        status: "running",
        payload,
        createdAt: expiresAt - 2_000,
        updatedAt: expiresAt - 1_000,
        expiresAt,
        ...context,
    };
}
