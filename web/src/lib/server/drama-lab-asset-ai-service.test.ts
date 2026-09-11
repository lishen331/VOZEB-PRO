import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getAuthSettings: vi.fn(),
    resolveLogicalModelCandidates: vi.fn(),
    resolveVisionModelCandidates: vi.fn(),
    requestStructuredText: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));
vi.mock("@/lib/server/logical-model-router", () => ({ resolveLogicalModelCandidates: mocks.resolveLogicalModelCandidates, resolveVisionModelCandidates: mocks.resolveVisionModelCandidates }));
vi.mock("@/lib/server/text-planning-runtime", () => ({ rankTextPlanningCandidates: <T>(items: T[]) => items, requestStructuredText: mocks.requestStructuredText }));
vi.mock("@/lib/server/system-ai-billing", () => ({ systemAiBillingHeaders: () => ({}), systemAiIdempotencyKey: () => "asset-ai-key" }));

import { runDramaLabAssetAiAction } from "./drama-lab-asset-ai-service";

const candidate = { channelId: "text-channel", upstreamModel: "writer", channel: {} };
const project = {
    id: "project-one",
    title: "测试项目",
    summary: "",
    style: "realistic",
    ratio: "16:9",
    status: "active" as const,
    creativeConversationId: "conversation-one",
    characters: [{ id: "character-one", name: "林忆", description: "主角", appearance: "短发红衣", profile: { visualIdentity: "", styling: "", colorPalette: "", consistencyRules: "" }, references: [] }],
    scenes: [],
    props: [],
    clues: [],
    defaultVideoMode: "storyboard" as const,
    episodes: [{ id: "episode-one", title: "第一集", script: "", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft" as const, shots: [] }],
    activeEpisodeId: "episode-one",
    createdAt: "2026-09-12T00:00:00.000Z",
    updatedAt: "2026-09-12T00:00:00.000Z",
};

describe("drama lab asset AI service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getAuthSettings.mockResolvedValue({ defaultModels: { textModel: "writer", visionModel: "vision" } });
        mocks.resolveLogicalModelCandidates.mockReturnValue([candidate]);
        mocks.resolveVisionModelCandidates.mockReturnValue([{ ...candidate, upstreamModel: "vision" }]);
    });

    it("generates and normalizes the final polished prompt", async () => {
        mocks.requestStructuredText.mockResolvedValue({ arguments: JSON.stringify({ polishedPrompt: "固定四视图最终提示词" }) });
        await expect(runDramaLabAssetAiAction({ userId: "user-one", origin: "http://app.test", cookie: "", requestId: "request-one", project, assetId: "character-one", kind: "characters", action: "prompt" })).resolves.toEqual({
            polishedPrompt: "固定四视图最终提示词",
        });
    });

    it("normalizes AI-generated multi-stage appearances", async () => {
        mocks.requestStructuredText.mockResolvedValue({
            arguments: JSON.stringify({
                stages: [
                    { episodeRange: [1, 3], appearance: "白色校服" },
                    { episodeRange: [4, 6], appearance: "深色风衣" },
                ],
            }),
        });
        await expect(runDramaLabAssetAiAction({ userId: "user-one", origin: "http://app.test", cookie: "", requestId: "request-two", project, assetId: "character-one", kind: "characters", action: "stages" })).resolves.toMatchObject({
            stages: expect.arrayContaining([
                { episodeRange: [1, 3], appearance: "白色校服" },
                { episodeRange: [4, 6], appearance: "深色风衣" },
            ]),
        });
    });
});
