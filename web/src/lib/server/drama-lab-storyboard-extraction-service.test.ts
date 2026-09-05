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
                projectId: "project-one",
                episodeId: "episode-one",
                status: "success",
                model: "writer",
            }),
        );

        const tool = request.tool;
        expect(tool.parameters.properties.shots.items.properties).toMatchObject({
            shotNumber: expect.objectContaining({ type: "integer" }),
            segmentIndex: expect.objectContaining({ type: "integer" }),
            angleH: { type: "string" },
            angleV: { type: "string" },
            angleS: { type: "string" },
            lightingStyle: { type: "string" },
            depthOfField: { type: "string" },
            creationMode: expect.objectContaining({ enum: ["classic", "universal"] }),
            imagePrompt: { type: "string" },
            videoPrompt: { type: "string" },
            continuity: expect.objectContaining({ type: "object" }),
        });
        expect(tool.parameters.properties.shots.items.properties.continuity.required).toEqual(
            expect.arrayContaining(["shotSize", "cameraAngle", "composition", "characterBlocking", "gazeDirection", "actionStart", "actionEnd", "screenDirection", "axisRule", "continuityNotes"]),
        );
    });

    it("rejects invalid asset IDs instead of mapping them by name", () => {
        expect(() => normalizeExtractedDramaLabStoryboards(JSON.stringify({ shots: [{ ...validShot, characterIds: ["林薇"] }] }), project)).toThrow(new DramaLabStoryboardExtractionError("第 1 个分镜引用了项目中不存在的角色 ID：林薇"));
    });

    it("accepts the LocalMiniDrama snake_case storyboard fields and keeps frame prompts", () => {
        const result = normalizeExtractedDramaLabStoryboards(
            JSON.stringify({
                storyboards: [
                    {
                        shot_number: "2",
                        title: "雨幕中的回头",
                        description: "林薇回头望向站台尽头。",
                        source_text: "她听见身后的脚步声，回头。",
                        shot_boundary: "脚步声响起至回头结束",
                        segment_index: 1,
                        segment_title: "站台危机",
                        camera_movement: "横移后缓推",
                        camera_angle: "中近景",
                        angle_h: "front",
                        angle_v: "eye",
                        angle_s: "medium",
                        shot_type: "中近景",
                        location: "雨夜车站",
                        time: "夜晚",
                        action: "回头寻找声音",
                        result: "发现空无一人",
                        emotion: "警觉",
                        emotion_intensity: 2,
                        atmosphere: "压迫",
                        lighting_style: "backlit",
                        depth_of_field: "shallow",
                        layout_description: "角色位于画面右侧，手机保持真实手掌尺度",
                        duration_sec: "4s",
                        creation_mode: "universal",
                        universal_segment_text: "0-2秒回头，2-4秒缓推至空站台",
                        polished_prompt: "电影感雨夜站台",
                        image_prompt: "雨夜车站中近景，林薇回头",
                        video_prompt: "横移后缓推，雨幕持续",
                        continuity: { camera_angle: "平视", action_start: "听见脚步", action_end: "回头望去" },
                        scene_id: "scene-station",
                        character_ids: ["character-lin"],
                        prop_ids: ["prop-phone"],
                    },
                ],
            }),
            project,
        );

        expect(result).toMatchObject([
            {
                order: 2,
                segmentIndex: 1,
                creationMode: "universal",
                universalSegmentText: "0-2秒回头，2-4秒缓推至空站台",
                imagePrompt: "雨夜车站中近景，林薇回头",
                videoPrompt: "横移后缓推，雨幕持续",
                continuity: { cameraAngle: "平视", actionStart: "听见脚步", actionEnd: "回头望去" },
            },
        ]);
    });

    it("persists a recoverable prefix and continues after truncated JSON without replacing duplicate orders", async () => {
        const first = JSON.stringify({
            shots: [
                { ...validShot, shotNumber: 1, title: "第一镜" },
                { ...validShot, shotNumber: 2, title: "第二镜" },
            ],
        }).slice(0, -2);
        const continuation = JSON.stringify({
            shots: [
                { ...validShot, shotNumber: 2, title: "重复第二镜" },
                { ...validShot, shotNumber: 3, title: "第三镜" },
            ],
        });
        mocks.requestStructuredText.mockReset();
        mocks.requestStructuredText.mockResolvedValueOnce({ arguments: first, headers: new Headers(), elapsedMs: 12 }).mockResolvedValueOnce({ arguments: continuation, headers: new Headers(), elapsedMs: 12 });
        const checkpoints: Array<{ orders: number[]; truncated: boolean }> = [];

        const result = await extractDramaLabStoryboards({
            userId: "user-one",
            origin: "http://localhost:3002",
            cookie: "session=test",
            requestId: "request-truncated",
            episodeId: "episode-one",
            project,
            onPartial: async (shots, meta) => {
                checkpoints.push({ orders: shots.map((shot) => shot.order), truncated: meta.truncated });
            },
        });

        expect(mocks.requestStructuredText).toHaveBeenCalledTimes(2);
        expect(checkpoints[0]).toMatchObject({ orders: [1, 2], truncated: true });
        expect(result.shots.map((shot) => [shot.order, shot.title])).toEqual([
            [1, "第一镜"],
            [2, "第二镜"],
            [3, "第三镜"],
        ]);
        expect(result.duplicateCount).toBeGreaterThan(0);
        expect(result.continuationAttempts).toBe(1);
    });
});
