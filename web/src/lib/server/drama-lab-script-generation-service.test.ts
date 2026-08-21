import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getAuthSettings: vi.fn(),
    resolveLogicalModelCandidates: vi.fn(),
    resolveDramaLabPrompt: vi.fn(),
    rankTextPlanningCandidates: vi.fn(),
    requestStructuredText: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings, refundUserPoints: vi.fn() }));
vi.mock("@/lib/server/logical-model-router", () => ({ resolveLogicalModelCandidates: mocks.resolveLogicalModelCandidates }));
vi.mock("@/lib/server/drama-lab-prompt-template-service", () => ({ resolveDramaLabPrompt: mocks.resolveDramaLabPrompt }));
vi.mock("@/lib/server/system-ai-billing", () => ({
    hasSystemAiCharge: () => false,
    readSystemAiBilling: () => ({}),
    systemAiBillingHeaders: () => ({}),
    systemAiIdempotencyKey: () => "key",
}));
vi.mock("@/lib/server/text-planning-runtime", () => ({ rankTextPlanningCandidates: mocks.rankTextPlanningCandidates, requestStructuredText: mocks.requestStructuredText }));

import { generateDramaLabScript } from "./drama-lab-script-generation-service";

describe("drama lab script generation", () => {
    beforeEach(() => {
        const candidate = { channelId: "channel", upstreamModel: "writer-vendor", channel: {} };
        mocks.getAuthSettings.mockResolvedValue({ defaultModels: { textModel: "writer" } });
        mocks.resolveLogicalModelCandidates.mockReturnValue([candidate]);
        mocks.rankTextPlanningCandidates.mockReturnValue([candidate]);
        mocks.resolveDramaLabPrompt.mockResolvedValue({ key: "story_generation", template: "CUSTOM STORY TEMPLATE" });
        mocks.requestStructuredText.mockResolvedValue({ arguments: JSON.stringify({ script: "第一集剧本正文" }), headers: new Headers() });
    });

    it("injects the configured story template and returns only the generated episode script", async () => {
        const result = await generateDramaLabScript({
            userId: "user-one",
            origin: "http://localhost:3002",
            cookie: "session=test",
            projectId: "project-one",
            episodeId: "episode-one",
            requestId: "request-one",
            storyOutline: "雨夜收到一封匿名信",
            storyStyle: "悬疑",
            scriptType: "短剧",
            episodeCount: "12",
        });
        expect(mocks.requestStructuredText.mock.calls[0]?.[0].messages[0].content).toContain("CUSTOM STORY TEMPLATE");
        expect(result).toEqual({ script: "第一集剧本正文", templateKey: "story_generation" });
    });
});
