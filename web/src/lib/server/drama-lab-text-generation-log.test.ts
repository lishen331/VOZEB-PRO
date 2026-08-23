import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getPublicUsersByIds: vi.fn(),
    recordGenerationLog: vi.fn(),
}));

vi.mock("@/lib/auth/store-actions", () => ({ getPublicUsersByIds: mocks.getPublicUsersByIds }));
vi.mock("@/lib/server/generation-log-store", () => ({ recordGenerationLog: mocks.recordGenerationLog }));

import { recordDramaLabTextGenerationLog } from "./drama-lab-text-generation-log";

describe("drama lab text generation log", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mocks.getPublicUsersByIds.mockResolvedValue([{ id: "user-one", username: "creator", displayName: "Creator" }]);
        mocks.recordGenerationLog.mockResolvedValue({});
    });

    it("records a completed short drama text operation for the calling user", async () => {
        await recordDramaLabTextGenerationLog({
            id: "drama-lab-script:project-one:episode-one:request-one",
            userId: "user-one",
            title: "Script generation",
            prompt: "A story outline",
            model: "writer",
            status: "success",
            durationMs: 456,
            createdAt: 1_700_000_000_000,
        });

        expect(mocks.getPublicUsersByIds).toHaveBeenCalledWith(["user-one"]);
        expect(mocks.recordGenerationLog).toHaveBeenCalledWith({
            id: "drama-lab-script:project-one:episode-one:request-one",
            taskId: "drama-lab-script:project-one:episode-one:request-one",
            userId: "user-one",
            username: "creator",
            displayName: "Creator",
            kind: "text",
            source: "drama",
            status: "success",
            title: "Script generation",
            prompt: "A story outline",
            model: "writer",
            summary: "Script generation completed",
            durationMs: 456,
            count: 1,
            successCount: 1,
            failCount: 0,
            createdAt: "2023-11-14T22:13:20.000Z",
            completedAt: expect.any(String),
        });
    });

    it("does not interrupt a successful generation when log persistence fails", async () => {
        mocks.recordGenerationLog.mockRejectedValue(new Error("database unavailable"));
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

        await expect(
            recordDramaLabTextGenerationLog({
                id: "drama-lab-script:project-one:episode-one:request-two",
                userId: "user-one",
                title: "Script generation",
                prompt: "A story outline",
                model: "writer",
                status: "success",
                durationMs: 456,
            }),
        ).resolves.toBeUndefined();

        expect(warn).toHaveBeenCalledWith("Drama lab text generation log update failed", expect.objectContaining({ id: "drama-lab-script:project-one:episode-one:request-two" }));
    });
});
