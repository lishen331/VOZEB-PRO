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

    it("stores practice sessions with mode, model and public error fields", async () => {
        const row = {
            id: "session-one",
            user_id: "user-one",
            module: "storyboard-image",
            mode: "workflow",
            selected_logical_model_id: "practice-image",
            error_code: "PRACTICE_DISPATCH_FAILED",
            error_message: "任务提交失败",
            status: "failed",
            prompt_json: {},
            input_json: {},
            task_refs: [],
        };
        const { executor, query } = mockExecutor([[row], [row]]);
        const repository = new PracticeRepository(executor);

        await repository.createPracticeSession({
            id: "session-one",
            userId: "user-one",
            projectId: "project-one",
            projectKind: "canvas",
            module: "storyboard-image",
            mode: "workflow",
            selectedLogicalModelId: "practice-image",
            errorCode: "PRACTICE_DISPATCH_FAILED",
            errorMessage: "任务提交失败",
            prompt: {},
            input: {},
            taskRefs: [],
            status: "failed",
        });
        expect(String(query.mock.calls[0]?.[0])).toContain("INSERT INTO practice_sessions");
        expect(String(query.mock.calls[0]?.[0])).toContain("'open-source-practice'");
        expect(String(query.mock.calls[0]?.[0])).toContain("selected_logical_model_id");
        expect(query.mock.calls[0]?.[1]).toEqual(expect.arrayContaining(["storyboard-image", "workflow", "practice-image", "PRACTICE_DISPATCH_FAILED", "failed"]));
        await expect(repository.getPracticeSessionForUser("user-one", "session-one")).resolves.toMatchObject({ mode: "workflow", selectedLogicalModelId: "practice-image", errorCode: "PRACTICE_DISPATCH_FAILED", errorMessage: "任务提交失败" });
    });

    it("claims a queued session with one conditional provider update", async () => {
        const { executor, query } = mockExecutor([[{ id: "session-one", user_id: "user-one", module: "script", status: "running", prompt_json: {}, input_json: {}, task_refs: [] }]]);
        const repository = new PracticeRepository(executor);

        await expect(repository.claimPracticeSessionDispatch("user-one", "session-one")).resolves.toMatchObject({ id: "session-one", status: "running" });

        expect(String(query.mock.calls[0]?.[0])).toContain("status = 'queued'");
        expect(String(query.mock.calls[0]?.[0])).toContain("task_refs = '[]'::jsonb");
        expect(query).toHaveBeenCalledOnce();
    });

    it("maps a legacy session without mode as workflow", async () => {
        const { executor } = mockExecutor([[{ id: "legacy", user_id: "user-one", module: "script", status: "success", prompt_json: {}, input_json: {}, task_refs: [{ taskId: "text-one" }] }]]);
        await expect(new PracticeRepository(executor).getPracticeSessionForUser("user-one", "legacy")).resolves.toMatchObject({ mode: "workflow", status: "success" });
    });

    it("resets a failed or cancelled session with one conditional provider update", async () => {
        const { executor, query } = mockExecutor([[{ id: "session-one", user_id: "user-one", module: "script", status: "queued", prompt_json: {}, input_json: {}, task_refs: [] }]]);
        const repository = new PracticeRepository(executor);

        await expect(repository.resetPracticeSessionForRetry("user-one", "session-one")).resolves.toMatchObject({ id: "session-one", status: "queued" });

        expect(String(query.mock.calls[0]?.[0])).toContain("status IN ('failed', 'cancelled') OR");
        expect(String(query.mock.calls[0]?.[0])).toContain("task_refs = '[]'::jsonb");
        expect(String(query.mock.calls[0]?.[0])).toContain("error_code = NULL");
        expect(query).toHaveBeenCalledOnce();
    });

    it("clears nullable error fields when a successful patch supplies undefined", async () => {
        const { executor, query } = mockExecutor([
            [{ id: "session-one", user_id: "user-one", module: "script", status: "success", prompt_json: {}, input_json: {}, task_refs: [], error_code: null, error_message: null }],
            [{ id: "session-one", user_id: "user-one", module: "script", status: "success", prompt_json: {}, input_json: {}, task_refs: [], error_code: null, error_message: null }],
        ]);
        const repository = new PracticeRepository(executor);

        await repository.updatePracticeSession("user-one", "session-one", { status: "success", errorCode: undefined, errorMessage: undefined });

        expect(String(query.mock.calls[1]?.[0])).not.toContain("COALESCE");
        const values = query.mock.calls[1]?.[1] as unknown[] | undefined;
        expect(values?.slice(-2)).toEqual([null, null]);
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

    postgresIt("allows only one concurrent retry reset and dispatch claim", async () => {
        const repository = createPostgresRepositories().practice;
        const sessionId = `practice-retry-session-${suffix}`;
        await repository.createPracticeSession({
            id: sessionId,
            userId: userOne,
            projectKind: "canvas",
            module: "script",
            title: "并发重试",
            clientRequestId: `practice-retry-${suffix}`,
            executionProfile: "open-source-practice",
            prompt: { prompt: "续写" },
            input: { prompt: "续写" },
            taskRefs: [],
            status: "failed",
        });

        const resets = await Promise.all([repository.resetPracticeSessionForRetry(userOne, sessionId), repository.resetPracticeSessionForRetry(userOne, sessionId)]);
        expect(resets.filter(Boolean)).toHaveLength(1);

        const claims = await Promise.all([repository.claimPracticeSessionDispatch(userOne, sessionId), repository.claimPracticeSessionDispatch(userOne, sessionId)]);
        expect(claims.filter(Boolean)).toHaveLength(1);
    });
});
