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

describe("story submission prompt", () => {
    it("uses the requested count throughout the production template before creating the task", async () => {
        const { getAuthSettings } = await import("@/lib/auth/store");
        const { resolveLogicalModelCandidates } = await import("./logical-model-router");
        const { toSystemGenerationChannel } = await import("./generation-channel");
        const { resolveDramaLabPrompt, withDramaLabPromptContract } = await import("./drama-lab-prompt-template-service");
        const { dramaLabPromptDefinition } = await import("@/lib/drama-lab-prompt-templates");
        const { getDramaLabCollaborationForUser } = await import("./drama-lab-collaboration-service");
        const { getStoredGenerationTaskByRequest, queryStoredGenerationTasks, withGenerationConcurrencyLimit } = await import("./generation-task-store");
        const { createTextTask } = await import("./text-task-store");
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ ownerUserId: "user-one", project: { id: "project-one", title: "story", style: "realistic", ratio: "9:16", episodes: [{ id: "episode-one", title: "one", script: "" }] } });
        vi.mocked(getDramaLabCollaborationForUser).mockResolvedValue({ members: [] } as never);
        vi.mocked(getStoredGenerationTaskByRequest).mockResolvedValue(null);
        vi.mocked(queryStoredGenerationTasks).mockResolvedValue([]);
        vi.mocked(getAuthSettings).mockResolvedValue({ defaultModels: { textModel: "fixture" }, generationConcurrency: { text: 1 } } as never);
        vi.mocked(resolveLogicalModelCandidates).mockReturnValue([{}] as never);
        vi.mocked(toSystemGenerationChannel).mockReturnValue({ model: "fixture" } as never);
        vi.mocked(resolveDramaLabPrompt).mockResolvedValue({ ...dramaLabPromptDefinition("story_generation"), customized: false });
        vi.mocked(withDramaLabPromptContract).mockImplementation((body, contract) => `${body}\n${contract}`);
        vi.mocked(withGenerationConcurrencyLimit).mockImplementation(async (_user, _type, _ttl, _limit, run) => run());
        vi.mocked(createTextTask).mockImplementation(async (input) => ({ ...input, id: "fixture-task" }) as never);
        const { startDramaLabStoryGeneration } = await import("./drama-lab-story-generation-service");
        await startDramaLabStoryGeneration({ userId: "user-one", projectId: "project-one", sourceEpisodeId: "episode-one", requestId: "count", storyOutline: "故事梗概", storyStyle: "现代", scriptType: "剧情", episodeCount: 3 });
        const request = vi.mocked(createTextTask).mock.calls.at(-1)![0];
        const system = request.messages[0].content;
        expect(system).toContain("创作 3 集");
        expect(system).not.toContain("{{episodeCount}}");
        expect(system).toContain("数组长度必须为 3");
        expect(request.storyBatch?.episodeCount).toBe(3);
        expect(request.config.maxOutputTokens).toBe(6_600);
    });
});
