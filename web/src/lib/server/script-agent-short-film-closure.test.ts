import { describe, expect, it, vi } from "vitest";
import { ScriptAgentExecutor } from "./script-agent-executor";

const scope = { schoolId: "school-a", ownerUserId: "user-a" };
const outputs = {
    project_planning: { content: "定位世界观人物大纲" },
    short_story: { title: "雨夜", content: "完整小说正文" },
    adaptation_bundle: { content: "骨架策略", episodes: [{ episodeNumber: 1, title: "归来", outline: { core: "复仇" } }] },
    episode_scripts: {
        content: "剧本完成",
        episodes: [
            {
                episodeNumber: 1,
                title: "归来",
                script: {
                    blocks: [
                        { type: "scene-heading", text: "内景 公司 日" },
                        { type: "action", text: "她推门而入" },
                    ],
                },
            },
        ],
    },
    script_review: { report: "审核通过并完成明显问题修正" },
    director_plan: { content: "导演规划" },
    text_storyboard: {
        content: "分镜完成",
        episodes: [
            {
                episodeNumber: 1,
                shots: [
                    {
                        sceneId: "scene-1",
                        shotNumber: 1,
                        visualDescription: "她推门",
                        shotSize: "中景",
                        cameraAngle: "平视",
                        composition: "居中",
                        cameraMovement: "推进",
                        characterIds: [],
                        action: "推门",
                        emotion: "坚定",
                        durationSeconds: 3,
                        characterAssetIds: [],
                        propAssetIds: [],
                    },
                ],
            },
        ],
    },
    asset_prompts: { content: "资产完成", assets: [{ type: "character", name: "女主", prompt: "二十五岁都市女性" }] },
} as const;
describe("short film screenwriter closure", () => {
    it("persists every stage in order and ends at text prompts without a media task", async () => {
        const artifacts: Record<string, unknown>[] = [];
        const stages = Object.keys(outputs) as Array<keyof typeof outputs>;
        const deps = {
            resolveProfile: vi.fn(async () => ({ profile: { agentKey: "novel_planner", name: "Agent", toolAllowlist: [], skillBindings: [], version: 1 }, candidate: { channel: { purpose: "open-source-practice" } }, instructions: "执行" })),
            callModel: vi.fn(async ({ task }) => outputs[task.runType as keyof typeof outputs]),
            listArtifacts: vi.fn(async () => artifacts),
            saveArtifact: vi.fn(async (_scope, input) => {
                artifacts.push({ artifact_type: input.artifactType, artifact_key: input.artifactKey, status: input.status, content_json: input.content });
                return { id: input.id };
            }),
            replaceEpisodes: vi.fn(),
            replaceStoryboardEpisodes: vi.fn(),
            upsertPromptAssets: vi.fn(),
            appendEvent: vi.fn(),
        };
        for (const runType of stages) await new ScriptAgentExecutor(deps as never).execute(scope, { projectId: "project-a", runId: `run-${runType}`, runType, input: {}, origin: "https://local", cookie: "session" });
        expect(deps.replaceEpisodes).toHaveBeenCalledTimes(2);
        expect(deps.replaceStoryboardEpisodes).toHaveBeenCalledOnce();
        expect(deps.upsertPromptAssets).toHaveBeenCalledOnce();
        expect(artifacts.map((item) => item.artifact_type)).toEqual(["creative_positioning", "short_story", "adaptation_strategy", "episode_scripts", "review_report", "director_plan", "text_storyboard", "asset_prompts"]);
        expect(JSON.stringify(deps)).not.toMatch(/generate_(image|video|audio)|dubbing/);
    });
});
