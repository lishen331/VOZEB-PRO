import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    isPostgresDatabaseEnabled: vi.fn(),
    ensurePostgresSchema: vi.fn(),
    getByIds: vi.fn(),
    list: vi.fn(),
    readGenerationLogDb: vi.fn(),
}));

vi.mock("@/lib/server/database", () => ({
    isPostgresDatabaseEnabled: mocks.isPostgresDatabaseEnabled,
    ensurePostgresSchema: mocks.ensurePostgresSchema,
    createPostgresRepositories: () => ({ generationLogs: { getByIds: mocks.getByIds, list: mocks.list } }),
    withPostgresTransaction: vi.fn(),
}));
vi.mock("./generation-log-repository", async (importOriginal) => ({ ...(await importOriginal<typeof import("./generation-log-repository")>()), readGenerationLogDb: mocks.readGenerationLogDb }));

import { getGenerationLogForUser } from "./generation-log-store";

describe("getGenerationLogForUser", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isPostgresDatabaseEnabled.mockReturnValue(true);
    });

    it("uses the PostgreSQL repository exact-id query with owner scope", async () => {
        mocks.getByIds.mockResolvedValue([generationLog("generation-a", "user-a")]);

        await expect(getGenerationLogForUser("user-a", "generation-a")).resolves.toMatchObject({ id: "generation-a", userId: "user-a" });

        expect(mocks.getByIds).toHaveBeenCalledWith(["generation-a"], "user-a");
        expect(mocks.list).not.toHaveBeenCalled();
        expect(mocks.readGenerationLogDb).not.toHaveBeenCalled();
    });

    it("returns null when PostgreSQL has no owner-scoped match", async () => {
        mocks.getByIds.mockResolvedValue([]);

        await expect(getGenerationLogForUser("user-a", "generation-b")).resolves.toBeNull();
    });

    it("reads the file database directly and filters both id and owner", async () => {
        mocks.isPostgresDatabaseEnabled.mockReturnValue(false);
        mocks.readGenerationLogDb.mockResolvedValue({ version: 1, logs: [generationLog("generation-a", "user-a"), generationLog("generation-b", "user-b")] });

        await expect(getGenerationLogForUser("user-a", "generation-a")).resolves.toMatchObject({ id: "generation-a" });
        await expect(getGenerationLogForUser("user-a", "generation-b")).resolves.toBeNull();

        expect(mocks.getByIds).not.toHaveBeenCalled();
        expect(mocks.list).not.toHaveBeenCalled();
    });

    it("does not query either provider for an empty id", async () => {
        await expect(getGenerationLogForUser("user-a", "  ")).resolves.toBeNull();
        expect(mocks.getByIds).not.toHaveBeenCalled();
        expect(mocks.readGenerationLogDb).not.toHaveBeenCalled();
    });
});

function generationLog(id: string, userId: string) {
    return {
        id,
        userId,
        username: userId,
        displayName: userId,
        kind: "image" as const,
        source: "image-workbench",
        status: "success" as const,
        title: "生成结果",
        prompt: "prompt",
        model: "model",
        summary: "完成",
        durationMs: 100,
        count: 1,
        successCount: 1,
        failCount: 0,
        assets: [{ type: "image" as const, url: "/api/generation-log-assets/result.png" }],
        createdAt: "2026-08-17T00:00:00.000Z",
        updatedAt: "2026-08-17T00:00:00.000Z",
    };
}
