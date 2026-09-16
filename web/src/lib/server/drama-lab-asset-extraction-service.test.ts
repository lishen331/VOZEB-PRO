import { dramaLabPromptDefinition } from "@/lib/drama-lab-prompt-templates";
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
vi.mock("@/lib/server/drama-lab-prompt-template-service", () => ({ resolveDramaLabPrompt: mocks.resolveDramaLabPrompt }));
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
        vi.clearAllMocks();
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

        expect(mocks.requestStructuredText.mock.calls[0]?.[0].messages).toEqual([
            { role: "system", content: "CUSTOM CHARACTER TEMPLATE" },
            { role: "user", content: "剧本内容：\n林薇在车站遇见周明。\n\n请提取剧本中所有有名字角色的设定。" },
        ]);
        expect(mocks.requestStructuredText.mock.calls[0]?.[0]).toMatchObject({ preferNativeTools: true, allowRepair: false });
        expect(result.assets).toMatchObject([{ name: "周明", description: "同事" }]);
        expect(result.skippedCount).toBe(1);
        const properties = mocks.requestStructuredText.mock.calls[0][0].tool.parameters.properties.items.items.properties;
        expect(properties).toEqual({
            name: { type: "string" },
            role: { type: "string", enum: ["main", "supporting", "minor"] },
            appearance: { type: "string" },
            description: { type: "string" },
        });
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

    it.each([
        { kind: "character" as const, item: { name: "林薇", description: "主角", role: "main", appearance: "年轻女生，短发红衣" }, expected: { appearance: "年轻女生，短发红衣", role: "main" } },
        { kind: "scene" as const, item: { location: "古宅", time: "黄昏", description: "旧宅", prompt: "古宅纯背景，无人物，暖色侧光" }, expected: { name: "古宅", time: "黄昏", imagePrompt: "古宅纯背景，无人物，暖色侧光" } },
        { kind: "prop" as const, item: { name: "铜灯", description: "林薇的关键线索", type: "证物", image_prompt: "单一铜灯，纯色背景，无人物无手，真实尺度" }, expected: { type: "证物", imagePrompt: "单一铜灯，纯色背景，无人物无手，真实尺度" } },
    ])("preserves production $kind visual fields in the extracted result", ({ kind, item, expected }) => {
        const result = normalizeExtractedDramaLabAssets(JSON.stringify({ items: [item] }), kind, []);
        expect(result[0]).toMatchObject(expected);
    });

    it("substitutes production asset template variables before sending the request", async () => {
        mocks.resolveDramaLabPrompt.mockResolvedValue(dramaLabPromptDefinition("prop_extraction"));
        mocks.requestStructuredText.mockResolvedValue({ arguments: JSON.stringify({ items: [{ name: "铜灯", type: "线索", description: "主角使用", imagePrompt: "单一铜灯，纯色底，无人物" }] }), headers: new Headers(), elapsedMs: 1 });
        const result = await extractDramaLabAssets({
            userId: "fixture",
            origin: "http://127.0.0.1",
            cookie: "",
            requestId: "props",
            episodeId: "ep",
            assetType: "prop",
            project: {
                id: "project",
                title: "test",
                summary: "",
                style: "realistic",
                ratio: "9:16",
                status: "active",
                characters: [],
                scenes: [],
                props: [],
                clues: [],
                defaultVideoMode: "storyboard",
                episodes: [{ id: "ep", title: "test", script: "主角拿起铜灯", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots: [] }],
                createdAt: "",
                updatedAt: "",
            },
        });
        const request = mocks.requestStructuredText.mock.calls[0][0];
        expect(request.messages[0].content).toContain("真实皮肤纹理");
        expect(request.messages[0].content).not.toContain("{{aspectRatio}}");
        expect(request.messages[1].content).toBe("【剧本内容】\n主角拿起铜灯");
        expect(request.messages[0].content).not.toContain("系统固定输出契约");
        expect(result.assets[0]).toMatchObject({ imagePrompt: "单一铜灯，纯色底，无人物", type: "线索" });
    });

    it("keeps scenes with the same location when their times differ", () => {
        const items = normalizeExtractedDramaLabAssets(
            JSON.stringify({
                items: [
                    { name: "医院", time: "白天", description: "白天值守" },
                    { name: "医院", time: "夜晚", description: "夜间值守" },
                    { name: "医院", time: "夜晚", description: "重复夜景" },
                ],
            }),
            "scene",
            [],
        );
        expect(items).toHaveLength(2);
        expect(items.map((item) => (item as { time?: string }).time)).toEqual(["白天", "夜晚"]);
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

    it.each([
        { kind: "character" as const, output: [{ name: "林薇", role: "main", description: "主角", appearance: "短发" }], expected: { name: "林薇" } },
        { kind: "scene" as const, output: [{ location: "公园", time: "深夜", prompt: "公园夜景，无人物" }], expected: { name: "公园", time: "深夜" } },
        { kind: "prop" as const, output: [{ name: "光球", type: "装置", description: "关键道具", image_prompt: "单一光球" }], expected: { name: "光球", type: "装置" } },
    ])("accepts L root-array output for $kind", ({ kind, output, expected }) => {
        expect(normalizeExtractedDramaLabAssets(JSON.stringify(output), kind, [])).toMatchObject([expected]);
    });

    it.each([
        { kind: "scene" as const, keys: ["location", "time", "prompt"] },
        { kind: "prop" as const, keys: ["name", "type", "description", "image_prompt"] },
    ])("uses the exact L field contract for $kind tool output", async ({ kind, keys }) => {
        mocks.resolveDramaLabPrompt.mockResolvedValue({ key: `${kind}_extraction`, template: "L TEMPLATE" });
        mocks.requestStructuredText.mockResolvedValue({ arguments: JSON.stringify({ items: [] }), headers: new Headers(), elapsedMs: 1 });
        await extractDramaLabAssets({
            userId: "user-one",
            origin: "http://localhost:3002",
            cookie: "session=test",
            requestId: `request-${kind}`,
            episodeId: "episode-one",
            assetType: kind,
            project: {
                id: "project-one",
                title: "短剧",
                summary: "",
                style: "现代写实",
                ratio: "9:16",
                status: "active",
                characters: [],
                scenes: [],
                props: [],
                clues: [],
                defaultVideoMode: "storyboard",
                episodes: [{ id: "episode-one", title: "第一集", script: "林薇在公园拿起铜灯。", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots: [] }],
                createdAt: "",
                updatedAt: "",
            },
        });
        const schema = mocks.requestStructuredText.mock.calls.at(-1)?.[0].tool.parameters.properties.items.items;
        expect(Object.keys(schema.properties)).toEqual(keys);
        expect(schema.required).toEqual(keys);
    });
});
