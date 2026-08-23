import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getAuthSettings: vi.fn(),
    resolveLogicalModelCandidates: vi.fn(),
    resolveDramaLabPrompt: vi.fn(),
    rankTextPlanningCandidates: vi.fn(),
    requestStructuredText: vi.fn(),
    recordDramaLabTextGenerationLog: vi.fn(),
}));

vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings, refundUserPoints: vi.fn() }));
vi.mock("@/lib/server/logical-model-router", () => ({ resolveLogicalModelCandidates: mocks.resolveLogicalModelCandidates }));
vi.mock("@/lib/server/drama-lab-prompt-template-service", () => ({
    resolveDramaLabPrompt: mocks.resolveDramaLabPrompt,
    withDramaLabPromptContract: (template: string, contract: string) => `${template}\n${contract}`,
}));
vi.mock("@/lib/server/text-planning-runtime", () => ({ rankTextPlanningCandidates: mocks.rankTextPlanningCandidates, requestStructuredText: mocks.requestStructuredText }));
vi.mock("@/lib/server/drama-lab-text-generation-log", () => ({ recordDramaLabTextGenerationLog: mocks.recordDramaLabTextGenerationLog }));
vi.mock("@/lib/server/system-ai-billing", () => ({
    hasSystemAiCharge: () => false,
    readSystemAiBilling: () => ({}),
    systemAiBillingHeaders: () => ({}),
    systemAiIdempotencyKey: () => "key",
}));

import { DramaLabStoryboardExtractionError, extractDramaLabStoryboards, normalizeExtractedDramaLabStoryboards } from "./drama-lab-storyboard-extraction-service";

const project = {
    id: "project-one",
    title: "短剧",
    summary: "",
    style: "现代写实",
    ratio: "9:16",
    status: "active" as const,
    characters: [{ id: "character-lin", name: "林薇", description: "女主" }],
    scenes: [{ id: "scene-station", name: "车站", description: "雨夜站台" }],
    props: [{ id: "prop-phone", name: "手机", description: "裂屏手机" }],
    clues: [],
    defaultVideoMode: "storyboard" as const,
    episodes: [{ id: "episode-one", title: "第一集", script: "林薇在雨夜车站接起手机。", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft" as const, shots: [] }],
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
};

const validShot = {
    title: "雨夜来电",
    description: "林薇站在雨夜车站接起裂屏手机。",
    sourceText: "林薇在雨夜车站接起手机。",
    shotBoundary: "林薇听到来电，镜头切到她接听后。",
    dialogue: "林薇：喂？",
    narration: "",
    cameraMotion: "缓慢推进",
    cameraAngle: "中景",
    duration: 3,
    sceneId: "scene-station",
    characterIds: ["character-lin"],
    propIds: ["prop-phone"],
};

describe("drama lab storyboard extraction", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getAuthSettings.mockResolvedValue({ defaultModels: { textModel: "writer" } });
        const candidate = { channelId: "channel", upstreamModel: "writer-vendor", channel: {} };
        mocks.resolveLogicalModelCandidates.mockReturnValue([candidate]);
        mocks.rankTextPlanningCandidates.mockReturnValue([candidate]);
        mocks.resolveDramaLabPrompt.mockResolvedValueOnce({ key: "storyboard_system", template: "CUSTOM STORYBOARD TEMPLATE" }).mockResolvedValueOnce({ key: "storyboard_output_format", template: "CUSTOM OUTPUT TEMPLATE" });
        mocks.requestStructuredText.mockResolvedValue({ arguments: JSON.stringify({ shots: [validShot] }), headers: new Headers(), elapsedMs: 12 });
    });

    it("injects the configured templates and persists only project asset IDs in the result", async () => {
        const result = await extractDramaLabStoryboards({
            userId: "user-one",
            origin: "http://localhost:3002",
            cookie: "session=test",
            requestId: "request-one",
            episodeId: "episode-one",
            project,
        });

        const request = mocks.requestStructuredText.mock.calls[0]?.[0];
        expect(request.messages[0].content).toContain("CUSTOM STORYBOARD TEMPLATE");
        expect(request.messages[0].content).toContain("CUSTOM OUTPUT TEMPLATE");
        expect(request.messages[1].content).toContain("scene-station");
        expect(result.shots).toMatchObject([{ order: 1, sceneId: "scene-station", characterIds: ["character-lin"], propIds: ["prop-phone"], description: validShot.description }]);
        expect(mocks.recordDramaLabTextGenerationLog).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "drama-lab-storyboard:project-one:episode-one:request-one",
                userId: "user-one",
                status: "success",
                model: "writer",
            }),
        );
    });

    it("rejects invalid asset IDs instead of mapping them by name", () => {
        expect(() => normalizeExtractedDramaLabStoryboards(JSON.stringify({ shots: [{ ...validShot, characterIds: ["林薇"] }] }), project)).toThrow(new DramaLabStoryboardExtractionError("第 1 个分镜引用了项目中不存在的角色 ID：林薇"));
    });
});
