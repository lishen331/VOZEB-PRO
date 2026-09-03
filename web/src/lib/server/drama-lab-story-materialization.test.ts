import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TextTask } from "./text-task-store";

const mocks = vi.hoisted(() => ({
    getTextTask: vi.fn(),
    mutateStoredGenerationTask: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
    updateDramaProjectForUser: vi.fn(),
}));

vi.mock("@/lib/server/text-task-store", () => ({
    createTextTask: vi.fn(),
    getTextTask: mocks.getTextTask,
    transitionTextTask: vi.fn(),
    updateTextTask: vi.fn(),
}));

vi.mock("@/lib/server/generation-task-store", () => ({
    getStoredGenerationTaskByRequest: vi.fn(),
    linkStoredGenerationTask: vi.fn(),
    mutateStoredGenerationTask: mocks.mutateStoredGenerationTask,
    queryStoredGenerationTasks: vi.fn(),
    withGenerationConcurrencyLimit: vi.fn(),
}));

vi.mock("@/lib/server/drama-project-service", () => ({ updateDramaProjectForUser: mocks.updateDramaProjectForUser }));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({
    getDramaLabCollaborationForUser: vi.fn(),
    resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest,
}));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: vi.fn() }));
vi.mock("@/lib/server/generation-channel", () => ({ toSystemGenerationChannel: vi.fn() }));
vi.mock("@/lib/server/logical-model-router", () => ({ resolveLogicalModelCandidates: vi.fn() }));
vi.mock("@/lib/server/drama-lab-prompt-template-service", () => ({ resolveDramaLabPrompt: vi.fn(), withDramaLabPromptContract: vi.fn() }));
vi.mock("@/lib/server/generation-task-scheduler", () => ({ scheduleGenerationTask: vi.fn() }));
vi.mock("@/lib/server/ip-library-reference-service", () => ({ validateGenerationContextIpReferences: vi.fn() }));
vi.mock("@/lib/server/school-compute-billing-context", () => ({ resolveSchoolComputeBillingContext: vi.fn() }));
vi.mock("@/lib/server/generation-task-cancellation-service", () => ({ cancellationExecutionPatch: vi.fn() }));
vi.mock("@/lib/server/structured-model-output", () => ({ extractJsonObjectText: vi.fn() }));

describe("Drama Lab story materialization", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("stops after cancellation wins while persisting episodes", async () => {
        const batch = {
            version: 1 as const,
            projectId: "project-one",
            sourceEpisodeId: "episode-one",
            sourceEpisodeIndex: 0,
            targetEpisodeIds: ["episode-one", "episode-two"],
            episodeCount: 2,
            storyOutline: "outline",
            storyStyle: "modern",
            scriptType: "short-drama",
            status: "pending" as const,
            persistedEpisodeIndexes: [],
            startedAt: 1,
        };
        const task = {
            id: "story-task",
            userId: "user-one",
            status: "success" as const,
            createdAt: 1,
            updatedAt: 1,
            config: { baseUrl: "https://example.test", apiKey: "", apiFormat: "openai" as const, model: "writer" },
            messages: [],
            result: {
                content: JSON.stringify({
                    episodes: [
                        { episode: 1, title: "One", content: "Script one" },
                        { episode: 2, title: "Two", content: "Script two" },
                    ],
                }),
            },
            storyBatch: batch,
        } as unknown as TextTask;
        const persisting = { ...task, storyBatch: { ...batch, status: "persisting" as const } } as TextTask;
        const cancelled = { ...task, status: "cancelled" as const, storyBatch: { ...batch, status: "cancelled" as const, error: "任务已取消" } } as TextTask;
        let readCount = 0;
        mocks.getTextTask.mockImplementation(async () => (readCount++ === 0 ? task : readCount === 2 ? persisting : cancelled));
        let mutationCount = 0;
        mocks.mutateStoredGenerationTask.mockImplementation(async (_type: string, _id: string, _ttl: number, mutate: (current: TextTask) => TextTask | null) => {
            mutationCount += 1;
            const current = mutationCount === 1 ? task : cancelled;
            return mutate(current);
        });
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({
            ownerUserId: "user-one",
            project: {
                id: "project-one",
                episodes: [
                    { id: "episode-one", episodeNumber: 1, title: "One", script: "", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots: [] },
                    { id: "episode-two", episodeNumber: 2, title: "Two", script: "", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots: [] },
                ],
            },
        });

        const { materializeDramaLabStoryTask } = await import("./drama-lab-story-generation-service");
        const result = await materializeDramaLabStoryTask(task);

        expect(result?.status).toBe("cancelled");
        expect(mocks.updateDramaProjectForUser).toHaveBeenCalledTimes(1);
        expect(mocks.mutateStoredGenerationTask).toHaveBeenCalledTimes(2);
    });
});
