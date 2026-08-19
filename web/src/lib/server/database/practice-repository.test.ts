import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createPostgresRepositories } from "./repositories";
import { initializePostgresSchema, postgresQuery, type QueryExecutor } from "./postgres";
import { PracticeRepository } from "./practice-repository";

function mockExecutor(rows: Record<string, unknown>[][] = []) {
    const query = vi.fn(async (..._args: unknown[]) => ({ rows: rows.shift() || [], rowCount: 1 }));
    return { query, executor: { query } as unknown as QueryExecutor };
}

describe("PracticeRepository", () => {
    it("reads a pull-film version without using the featured flag", async () => {
        const { executor, query } = mockExecutor([
            [
                {
                    id: "version-one",
                    work_id: "work-one",
                    pull_film_enabled: true,
                    pull_film_snapshot: { sourceType: "canvas", versionId: "version-one", nodes: [], assets: [] },
                    pull_film_enabled_at: "2026-08-18T00:00:00.000Z",
                    pull_film_enabled_by_user_id: "admin-one",
                    is_featured: false,
                },
            ],
        ]);
        const repository = new PracticeRepository(executor);

        await expect(repository.getPullFilmVersion("work-one", "version-one")).resolves.toMatchObject({ enabled: true, snapshot: expect.any(Object) });
        expect(String(query.mock.calls[0]?.[0])).toContain("pull_film_enabled");
        expect(String(query.mock.calls[0]?.[0])).not.toContain("is_featured");
    });

    it("claims copy requests idempotently per user and client request", async () => {
        const { executor, query } = mockExecutor([
            [
                {
                    user_id: "user-one",
                    client_request_id: "request-one",
                    project_kind: "canvas",
                    project_id: "practice-project",
                },
            ],
        ]);
        const repository = new PracticeRepository(executor);

        await expect(repository.claimCopyRequest({ userId: "user-one", clientRequestId: "request-one", sourceWorkId: "work-one", sourceVersionId: "version-one", projectKind: "canvas", projectId: "practice-project" })).resolves.toMatchObject({
            projectId: "practice-project",
        });
        expect(String(query.mock.calls[0]?.[0])).toContain("ON CONFLICT (user_id, client_request_id)");
    });

    it("stores practice sessions with explicit module and status", async () => {
        const { executor, query } = mockExecutor([[{ id: "session-one", user_id: "user-one", module: "script", status: "queued", prompt_json: {}, input_json: {}, task_refs: [] }]]);
        const repository = new PracticeRepository(executor);

        await repository.createPracticeSession({ id: "session-one", userId: "user-one", projectId: "project-one", projectKind: "canvas", module: "script", prompt: {}, input: {}, taskRefs: [], status: "queued" });
        expect(String(query.mock.calls[0]?.[0])).toContain("INSERT INTO practice_sessions");
        expect(String(query.mock.calls[0]?.[0])).toContain("'open-source-practice'");
        expect(query.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(["script", "queued"]));
    });

    it("creates a copy inside the caller transaction with the practice execution profile", async () => {
        const { executor, query } = mockExecutor([[], []]);
        const repository = new PracticeRepository(executor);

        await repository.createPracticeProjectCopy({
            userId: "user-one",
            kind: "canvas",
            projectId: "practice-one",
            conversationId: "conversation-one",
            title: "练习画布",
            projectJson: { id: "practice-one", nodes: [] },
            createdAt: "2026-08-18T00:00:00.000Z",
            updatedAt: "2026-08-18T00:00:00.000Z",
            sourceWorkId: "work-one",
            sourceVersionId: "version-one",
            executionProfile: "open-source-practice",
        });

        expect(String(query.mock.calls[0]?.[0])).toContain("creative_conversations");
        expect(String(query.mock.calls[1]?.[0])).toContain("canvas_projects");
        expect(String(query.mock.calls[1]?.[0])).toContain("open-source-practice");
    });
});

const postgresIt = process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION === "1" ? it : it.skip;
const suffix = randomUUID();
const userOne = `practice-user-one-${suffix}`;
const userTwo = `practice-user-two-${suffix}`;
const canvasProject = `practice-canvas-${suffix}`;
const copiedCanvasProject = `practice-copied-canvas-${suffix}`;
const copiedConversation = `practice-copied-conversation-${suffix}`;
const workId = `practice-work-${suffix}`;
const versionId = `practice-version-${suffix}`;
const channelId = `practice-channel-${suffix}`;
let postgresSchemaReady = false;

describe("PracticeRepository PostgreSQL", () => {
    beforeAll(async () => {
        if (process.env.VOZEB_PRO_RUN_POSTGRES_INTEGRATION !== "1") return;
        if (!process.env.DATABASE_URL?.trim()) throw new Error("DATABASE_URL must point to a dedicated PostgreSQL test database");
        await initializePostgresSchema();
        postgresSchemaReady = true;
        await postgresQuery("INSERT INTO users (id, username, display_name, password_hash) VALUES ($1, $2, $2, 'test'), ($3, $4, $4, 'test')", [userOne, `practice-one-${suffix}`, userTwo, `practice-two-${suffix}`]);
    });

    afterAll(async () => {
        if (!postgresSchemaReady) return;
        await postgresQuery("DELETE FROM practice_sessions WHERE user_id = ANY($1::text[])", [[userOne, userTwo]]);
        await postgresQuery("DELETE FROM practice_copy_requests WHERE user_id = ANY($1::text[])", [[userOne, userTwo]]);
        await postgresQuery("DELETE FROM published_work_versions WHERE work_id = $1", [workId]);
        await postgresQuery("DELETE FROM published_works WHERE id = $1", [workId]);
        await postgresQuery("DELETE FROM canvas_projects WHERE id = $1", [canvasProject]);
        await postgresQuery("DELETE FROM canvas_projects WHERE id = $1", [copiedCanvasProject]);
        await postgresQuery("DELETE FROM creative_conversations WHERE id = $1", [copiedConversation]);
        await postgresQuery("DELETE FROM system_model_channels WHERE id = $1", [channelId]);
        await createPostgresRepositories().settings.updateSettings({ practiceDefaultModels: {} });
        await postgresQuery("DELETE FROM users WHERE id = ANY($1::text[])", [[userOne, userTwo]]);
    });

    postgresIt("round-trips practice defaults and normalizes legacy channel purpose", async () => {
        const repositories = createPostgresRepositories();
        const defaults = { textModel: "practice-text", imageModel: "", videoModel: "", audioModel: "" };
        await repositories.settings.updateSettings({ practiceDefaultModels: defaults });
        await postgresQuery("INSERT INTO system_model_channels (id, name, base_url, api_key_ciphertext, api_format, models, enabled) VALUES ($1, 'Legacy', '', '', 'openai', '[]'::jsonb, true)", [channelId]);

        const settings = await repositories.settings.getSettings();
        expect(settings.settings?.practiceDefaultModels).toEqual(defaults);
        expect(settings.channels.find((channel) => channel.id === channelId)?.purpose).toBe("shared");
    });

    postgresIt("keeps project execution identity immutable", async () => {
        await postgresQuery("INSERT INTO canvas_projects (id, user_id, title, project_json, execution_profile) VALUES ($1, $2, 'Production', '{}'::jsonb, 'production')", [canvasProject, userOne]);

        await expect(postgresQuery("UPDATE canvas_projects SET execution_profile = 'open-source-practice' WHERE id = $1", [canvasProject])).rejects.toMatchObject({ code: "23514" });
    });

    postgresIt("claims copy requests per user and keeps pull-film independent from featured", async () => {
        const repository = createPostgresRepositories().practice;
        const first = await repository.claimCopyRequest({ userId: userOne, clientRequestId: "same-request", sourceWorkId: workId, sourceVersionId: versionId, projectKind: "canvas", projectId: canvasProject });
        const retry = await repository.claimCopyRequest({ userId: userOne, clientRequestId: "same-request", sourceWorkId: "other-work", sourceVersionId: "other-version", projectKind: "drama", projectId: "other-project" });
        const otherUser = await repository.claimCopyRequest({ userId: userTwo, clientRequestId: "same-request", sourceWorkId: workId, sourceVersionId: versionId, projectKind: "canvas", projectId: `other-${canvasProject}` });

        expect(retry.projectId).toBe(first.projectId);
        expect(otherUser.projectId).not.toBe(first.projectId);

        await postgresQuery("INSERT INTO published_works (id, owner_user_id, slug, source_type, source_id, is_featured) VALUES ($1, $2, $3, 'canvas', $4, false)", [workId, userOne, `practice-${suffix}`, canvasProject]);
        await postgresQuery("INSERT INTO published_work_versions (id, work_id, version_number, title, moderation_status, visibility) VALUES ($1, $2, 1, 'Practice', 'approved', 'public')", [versionId, workId]);
        await repository.setPullFilmVersion({ workId, versionId, enabled: true, snapshot: { sourceType: "canvas", versionId, nodes: [], assets: [] }, enabledByUserId: userOne });

        expect(await repository.getPullFilmVersion(workId, versionId)).toMatchObject({ enabled: true, enabledByUserId: userOne });
        expect((await postgresQuery<{ is_featured: boolean }>("SELECT is_featured FROM published_works WHERE id = $1", [workId])).rows[0]?.is_featured).toBe(false);
    });

    postgresIt("creates a version-bound canvas copy with a practice identity", async () => {
        const repository = createPostgresRepositories().practice;
        await repository.createPracticeProjectCopy({
            userId: userOne,
            kind: "canvas",
            projectId: copiedCanvasProject,
            conversationId: copiedConversation,
            title: "复制练习",
            projectJson: { id: copiedCanvasProject, title: "复制练习", nodes: [] },
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceWorkId: workId,
            sourceVersionId: versionId,
            executionProfile: "open-source-practice",
        });

        expect(
            (
                await postgresQuery<{ execution_profile: string; practice_source_work_id: string; practice_source_version_id: string }>("SELECT execution_profile, practice_source_work_id, practice_source_version_id FROM canvas_projects WHERE id = $1", [
                    copiedCanvasProject,
                ])
            ).rows[0],
        ).toMatchObject({ execution_profile: "open-source-practice", practice_source_work_id: workId, practice_source_version_id: versionId });
    });
});
