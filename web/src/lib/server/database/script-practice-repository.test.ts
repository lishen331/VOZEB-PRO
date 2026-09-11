import { describe, expect, it, vi } from "vitest";
import { createPostgresScriptPracticeRepository } from "./script-practice-repository";

const now = "2026-09-11T00:00:00.000Z";
const document = { id: "document-a", projectId: "project-a", format: "structured" as const, blocks: [], version: 1, schemaVersion: 1 as const, createdAt: now, updatedAt: now };

describe("PostgreSQL script practice repository", () => {
    it("creates and reads a project only for its owner", async () => {
        const query = vi.fn();
        query.mockResolvedValueOnce({ rows: [{ id: "project-a", owner_user_id: "user-a", title: "剧本", status: "draft", source_type: "idea", created_at: now, updated_at: now }] });
        query.mockResolvedValueOnce({ rows: [] });
        const repository = createPostgresScriptPracticeRepository({ query });
        await expect(repository.createScriptProject({ id: "project-a", title: "剧本", status: "draft", sourceType: "idea" }, "user-a")).resolves.toMatchObject({ id: "project-a", userId: "user-a" });
        await expect(repository.getScriptProject("project-a", "user-b")).resolves.toBeNull();
        expect(query.mock.calls[1]?.[0]).toContain("owner_user_id = $2");
    });

    it("stores a structured version and rejects a stale current-version compare", async () => {
        const query = vi.fn();
        query.mockResolvedValueOnce({ rows: [{ id: "project-a", owner_user_id: "user-a", title: "剧本", status: "draft", source_type: "idea", created_at: now, updated_at: now }] });
        query.mockResolvedValueOnce({ rows: [{ id: "version-a", project_id: "project-a", version: 1, document_json: document, source: "user", created_at: now }] });
        query.mockResolvedValueOnce({ rows: [] });
        const repository = createPostgresScriptPracticeRepository({ query });
        await expect(repository.createScriptVersion({ id: "version-a", projectId: "project-a", documentSnapshot: document, source: "user", createdAt: now }, "user-a")).resolves.toMatchObject({ id: "version-a", projectId: "project-a" });
        await expect(repository.compareAndSetCurrentVersion("project-a", "user-a", "version-old", "version-a")).resolves.toBe(false);
    });
    it("reads a stage only for its owner", async () => {
        const query = vi.fn().mockResolvedValueOnce({ rows: [] });
        const repository = createPostgresScriptPracticeRepository({ query });
        await expect(repository.getScriptStage("project-a", "user-a", "synopsis")).resolves.toBeNull();
        expect(query.mock.calls[0]?.[0]).toContain("owner_user_id = $2");
    });

    it("lists owner projects with bounded filters", async () => {
        const query = vi.fn();
        query.mockResolvedValueOnce({ rows: [] });
        query.mockResolvedValueOnce({ rows: [{ total: "0" }] });
        const repository = createPostgresScriptPracticeRepository({ query });
        await expect(repository.listScriptProjects("user-a", { page: 2, pageSize: 10, keyword: "悬疑", status: "writing" })).resolves.toMatchObject({ page: 2, pageSize: 10, total: 0, items: [] });
        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[0]?.[0]).toContain("LIMIT $4 OFFSET $5");
    });
});
