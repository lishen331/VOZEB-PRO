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

import { extractDramaLabAssets, normalizeExtractedDramaLabAssets } from "./drama-lab-asset-extraction-service";

describe("drama lab asset extraction", () => {
    beforeEach(() => {
        mocks.getAuthSettings.mockResolvedValue({ defaultModels: { textModel: "writer" } });
        const candidate = { channelId: "channel", upstreamModel: "writer-vendor", channel: {} };
        mocks.resolveLogicalModelCandidates.mockReturnValue([candidate]);
        mocks.rankTextPlanningCandidates.mockReturnValue([candidate]);
        mocks.resolveDramaLabPrompt.mockResolvedValue({ key: "character_extraction", template: "CUSTOM CHARACTER TEMPLATE" });
        mocks.requestStructuredText.mockResolvedValue({
            arguments: JSON.stringify({
                items: [
                    { name: "林薇", description: "主角" },
                    { name: "周明", description: "同事" },
                ],
            }),
            headers: new Headers(),
        });
    });

    it("injects the configured task template and removes assets already in the project", async () => {
        const result = await extractDramaLabAssets({
            userId: "user-one",
            origin: "http://localhost:3002",
            cookie: "session=test",
            requestId: "request-one",
            episodeId: "episode-one",
            assetType: "character",
            project: {
                id: "project-one",
                title: "短剧",
                summary: "",
                style: "现代写实",
                ratio: "9:16",
                status: "active",
                characters: [{ id: "character-one", name: "林薇", description: "已有主角" }],
                scenes: [],
                props: [],
                clues: [],
                defaultVideoMode: "storyboard",
                episodes: [{ id: "episode-one", title: "第一集", script: "林薇在车站遇见周明。", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots: [] }],
                createdAt: "2026-08-21T00:00:00.000Z",
                updatedAt: "2026-08-21T00:00:00.000Z",
            },
        });

        expect(mocks.requestStructuredText.mock.calls[0]?.[0].messages[0].content).toContain("CUSTOM CHARACTER TEMPLATE");
        expect(result.assets).toMatchObject([{ name: "周明", description: "同事" }]);
        expect(result.skippedCount).toBe(1);
        expect(mocks.recordDramaLabTextGenerationLog).toHaveBeenCalledWith(
            expect.objectContaining({
                id: "drama-lab-extract:project-one:episode-one:character:request-one",
                userId: "user-one",
                projectId: "project-one",
                episodeId: "episode-one",
                status: "success",
                model: "writer",
            }),
        );
    });

    it("normalizes legacy scene locations when checking duplicate names", () => {
        const items = normalizeExtractedDramaLabAssets(
            JSON.stringify({
                items: [
                    { name: "咖啡馆", description: "室内" },
                    { name: "天台", description: "夜景", time: "深夜" },
                ],
            }),
            "scene",
            [{ id: "scene-one", name: "", location: "咖啡馆", description: "已有" } as never],
        );
        expect(items).toMatchObject([{ name: "天台", time: "深夜" }]);
    });
});
