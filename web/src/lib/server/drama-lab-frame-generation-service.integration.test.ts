import { createServer } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { DramaProject, DramaShotFrameType } from "@/lib/drama-project-contract";
import type { TextPlanningCandidate } from "./text-planning-runtime";

const mocks = vi.hoisted(() => ({ query: vi.fn(), settings: vi.fn(), candidates: vi.fn(), log: vi.fn() }));
vi.mock("@/lib/server/database", () => ({ getDatabaseProvider: () => "postgres", postgresQuery: mocks.query }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.settings }));
vi.mock("@/lib/server/logical-model-router", () => ({ resolveLogicalModelCandidates: mocks.candidates }));
vi.mock("@/lib/server/drama-lab-text-generation-log", () => ({ recordDramaLabTextGenerationLog: mocks.log }));
vi.mock("@/lib/server/channel-runtime-health", () => ({ recordChannelRuntimeSuccess: vi.fn(), recordChannelRuntimeFailure: vi.fn() }));
vi.mock("@/lib/server/maintenance-auth", () => ({ maintenanceWorkerContextHeaders: () => ({}) }));
vi.mock("@/lib/server/drama-project-store", () => ({ DramaProjectStoreError: class extends Error {}, getDramaProject: vi.fn(), updateDramaProject: vi.fn() }));
vi.mock("@/lib/server/generation-charge-service", () => ({ refundGenerationCharge: vi.fn() }));

import { prepareDramaLabFrame } from "./drama-lab-frame-generation-service";

const project: DramaProject = {
    id: "project-one",
    title: "雨夜来电",
    summary: "",
    style: "realistic",
    ratio: "9:16",
    status: "active" as const,
    creativeConversationId: "conversation-one",
    characters: [
        {
            id: "character-lin",
            name: "林薇",
            description: "红色风衣",
            references: [{ id: "character-ref", url: "/api/reference-assets/character.png", source: "upload" as const, label: "林薇主图", createdAt: "2026-08-22T00:00:00.000Z" }],
            primaryReferenceId: "character-ref",
        },
    ],
    scenes: [
        {
            id: "scene-station",
            name: "雨夜车站",
            description: "潮湿站台",
            references: [{ id: "scene-ref", url: "/api/reference-assets/scene.png", source: "upload" as const, label: "车站主图", createdAt: "2026-08-22T00:00:00.000Z" }],
            primaryReferenceId: "scene-ref",
        },
    ],
    props: [
        {
            id: "prop-phone",
            name: "裂屏手机",
            description: "关键道具",
            references: [{ id: "prop-ref", url: "/api/reference-assets/phone.png", source: "upload" as const, label: "手机主图", createdAt: "2026-08-22T00:00:00.000Z" }],
            primaryReferenceId: "prop-ref",
        },
    ],
    clues: [],
    defaultVideoMode: "storyboard" as const,
    episodes: [
        {
            id: "episode-one",
            title: "第一集",
            script: "林薇在雨夜车站接起电话。",
            outline: "",
            hook: "",
            nextPreview: "",
            sourceRange: "",
            reviewStatus: "draft" as const,
            shots: [
                {
                    id: "shot-one",
                    order: 1,
                    title: "雨夜来电",
                    description: "林薇在雨夜车站接起裂屏手机。",
                    sourceText: "林薇在雨夜车站接起电话。",
                    shotBoundary: "来电响起至林薇接听。",
                    dialogue: "林薇：喂？",
                    narration: "",
                    utterances: [],
                    imagePrompt: "中景，雨水映出霓虹",
                    videoPrompt: "镜头缓慢推进，林薇接起手机",
                    cameraMotion: "缓慢推进",
                    duration: 3,
                    characterIds: ["character-lin"],
                    propIds: ["prop-phone"],
                    clueIds: [],
                    sceneId: "scene-station",
                },
            ],
        },
    ],
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
};

let origin = "";
let reply = { prompt: "林薇（参考图中的人物形象）站在站台左侧。", description: "站台静帧" };
const requests: Array<{ url: string; body: { model: string; messages: Array<{ role: string; content: string }> } }> = [];
const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    requests.push({ url: req.url || "", body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ choices: [{ message: { role: "assistant", content: JSON.stringify(reply) } }] }));
});
beforeAll(async () => {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No fixture port");
    origin = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});
beforeEach(() => {
    vi.clearAllMocks();
    requests.length = 0;
    reply = { prompt: "林薇（参考图中的人物形象）站在站台左侧。", description: "站台静帧" };
    mocks.query.mockResolvedValue({ rows: [] });
    mocks.settings.mockResolvedValue({ defaultModels: { textModel: "fixture-logical" } });
    const candidate: TextPlanningCandidate = {
        channelId: "frame-fixture",
        upstreamModel: "fixture-model",
        channel: {
            id: "frame-fixture",
            name: "fixture",
            baseUrl: origin,
            apiKey: "fixture",
            apiFormat: "openai",
            models: ["fixture-model"],
            enabled: true,
            advancedConfig: {
                protocol: "newapi",
                textModel: "fixture-model",
                imageModel: "",
                videoModel: "",
                createPath: "",
                queryPath: "",
                requestTemplate: "",
                resultField: "",
                statusField: "",
                durationRange: "",
                referenceRule: "",
                supportsReferenceImage: false,
                supportsReferenceVideo: false,
                supportsReferenceAudio: false,
            },
        },
    };
    mocks.candidates.mockReturnValue([candidate]);
});
function input(frameType: DramaShotFrameType, value = project) {
    return { userId: "fixture-user", origin, cookie: "", requestId: `request-${frameType}`, project: value, episodeId: "episode-one", shotId: "shot-one", frameType };
}
describe("frame planning over local TCP with real template resolution and text runtime", () => {
    it.each(["first", "key", "last"] as const)("sends the production %s template, substituted style and fixed output contract", async (kind) => {
        const result = await prepareDramaLabFrame(input(kind));
        expect(requests).toHaveLength(1);
        expect(requests[0].url).toBe("/api/ai/system/frame-fixture/chat/completions");
        expect(requests[0].body.model).toBe("fixture-model");
        const system = requests[0].body.messages[0].content;
        expect(system).toContain("第1层-镜头设计");
        expect(system).toContain("真实皮肤纹理");
        expect(system).not.toMatch(/\{\{(?:stylePromptZh|aspectRatio)\}\}/);
        expect(system).toContain("系统固定输出契约");
        const context = JSON.parse(requests[0].body.messages[1].content);
        expect(context.project).toMatchObject({ style: "realistic", ratio: "9:16", stylePromptEn: expect.stringContaining("RAW photo") });
        expect(result.templateKey).toBe(`${kind}_frame_prompt`);
        expect(result.references.map((ref) => ref.id)).toEqual(["scene-ref", "character-ref", "prop-ref"]);
        expect(result.prompt).toBe(reply.prompt);
    });
    it("honors a custom admin template and substitutes values literally", async () => {
        mocks.query.mockResolvedValue({ rows: [{ template: "CUSTOM {{stylePromptZh}} / {{aspectRatio}} / {{untouched}}" }] });
        await prepareDramaLabFrame(input("key", { ...project, style: "custom $& style" }));
        const system = requests[0].body.messages[0].content;
        expect(system).toContain("CUSTOM custom $& style / 9:16 / {{untouched}}");
        expect(system).not.toContain("第1层-镜头设计");
        expect(system).toContain("系统固定输出契约");
    });
    it("keeps first-frame continuity in last-frame requests and cleans off-shot characters", async () => {
        const value = structuredClone(project);
        value.characters.push({ id: "off-shot", name: "顾城", description: "仅其他镜头出现" });
        value.episodes[0].shots[0].frames = { first: { prompt: "站台左侧的开场布局", url: "/first.png", status: "success" } };
        reply = { prompt: "林薇（红色风衣）位于画面左侧，顾城（黑衣）站在右侧。", description: "尾帧" };
        const result = await prepareDramaLabFrame(input("last", value));
        const system = requests[0].body.messages[0].content;
        expect(system).toContain("站台左侧的开场布局");
        expect(system).toContain("declared movement");
        expect(result.references[0].url).toBe("/first.png");
        expect(result.prompt).not.toContain("顾城");
        expect(result.prompt).toContain("林薇（参考图中的人物形象）");
    });
    it("rejects an empty model result instead of logging or returning success", async () => {
        reply = { prompt: "", description: "empty" };
        await expect(prepareDramaLabFrame(input("key"))).rejects.toThrow("必须包含 prompt 和 description");
        expect(mocks.log).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
        expect(mocks.log).not.toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
    });
    it("blocks missing primary references before consuming an upstream call", async () => {
        const value = structuredClone(project);
        value.props[0].references = [];
        value.props[0].primaryReferenceId = undefined;
        await expect(prepareDramaLabFrame(input("key", value))).rejects.toThrow("缺少主参考图");
        expect(requests).toHaveLength(0);
    });

    it("rejects foreign asset bindings before sending a request", async () => {
        const value = structuredClone(project);
        value.episodes[0].shots[0].sceneId = "foreign-scene";
        await expect(prepareDramaLabFrame(input("first", value))).rejects.toThrow("不存在的场景");
        expect(requests).toHaveLength(0);
    });
});
