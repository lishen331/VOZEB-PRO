import { describe, expect, it, vi } from "vitest";
import { ScriptAgentExecutor } from "./script-agent-executor";

const scope = { schoolId: "school-a", ownerUserId: "user-a" };
async function runForVisibleText(runType: "episode_scripts" | "text_storyboard" | "asset_prompts", output: Record<string, unknown>) {
    let visible = "";
    const deps = {
        resolveProfile: vi.fn().mockResolvedValue({ profile: { agentKey: "script_writer", name: "Agent", toolAllowlist: [], skillBindings: [], version: 1 }, candidate: { channel: { purpose: "open-source-practice" } }, instructions: "执行" }),
        callModel: vi.fn().mockResolvedValue(output),
        saveArtifact: vi.fn(async (_scope, input) => {
            visible = input.contentText || "";
            return { id: "artifact" };
        }),
        appendEvent: vi.fn(),
        replaceEpisodes: vi.fn(),
        replaceStoryboardEpisodes: vi.fn(),
        upsertPromptAssets: vi.fn(),
    };
    await new ScriptAgentExecutor(deps as never).execute(scope, { projectId: "project-a", runId: "run-a", runType, input: {}, origin: "https://local", cookie: "session" });
    return visible;
}
describe("ScriptAgentExecutor", () => {
    it("streams public artifact deltas, saves first, then emits artifact_saved", async () => {
        const order: string[] = [];
        const profile = {
            profile: { agentKey: "novel_writer", name: "小说作者", toolAllowlist: ["save_short_story"], skillBindings: ["core-novel-writer"], version: 1 },
            candidate: { logicalModelId: "writer", upstreamModel: "deepseek-chat", channelId: "c", channel: { purpose: "open-source-practice" } },
            instructions: "小说写作",
        };
        const deps = {
            resolveProfile: vi.fn().mockResolvedValue(profile),
            callModel: vi.fn(async (input) => {
                await input.onDelta?.('{"title":"雨夜","content":"第一段');
                await input.onDelta?.('正文"}');
                return { title: "雨夜", content: "第一段正文" };
            }),
            saveArtifact: vi.fn(async () => {
                order.push("save");
                return { id: "artifact-a" };
            }),
            appendEvent: vi.fn(async (_s, _p, _r, type) => {
                order.push(type);
            }),
        };
        const result = await new ScriptAgentExecutor(deps as never).execute(scope, { projectId: "project-a", runId: "run-a", runType: "short_story", input: { idea: "雨夜重生" }, origin: "https://local", cookie: "session" });
        expect(result).toMatchObject({ artifactId: "artifact-a" });
        expect(order.indexOf("save")).toBeLessThan(order.indexOf("artifact_saved"));
        expect(order).toContain("artifact_delta");
    });
    it("uses a concrete structured output schema for every short-film stage", async () => {
        const schemas: Array<Record<string, unknown>> = [];
        const deps = {
            resolveProfile: vi.fn().mockResolvedValue({ profile: { agentKey: "novel_planner", name: "策划", toolAllowlist: [], skillBindings: [], version: 1 }, candidate: { channel: { purpose: "open-source-practice" } }, instructions: "策划" }),
            callModel: vi.fn(async ({ responseSchema }) => {
                schemas.push(responseSchema);
                return { content: "ok" };
            }),
            saveArtifact: vi.fn().mockResolvedValue({ id: "artifact" }),
            appendEvent: vi.fn(),
        };
        for (const runType of ["project_planning", "short_story", "adaptation_bundle", "episode_scripts", "script_review", "director_plan", "text_storyboard", "asset_prompts"] as const) {
            await new ScriptAgentExecutor(deps as never).execute(scope, { projectId: "project-a", runId: `run-${runType}`, runType, input: {}, origin: "https://local", cookie: "session" });
        }
        expect(schemas).toHaveLength(8);
        expect(schemas.every((schema) => Array.isArray(schema.required) && schema.required.length > 0)).toBe(true);
    });

    it("persists the public assistant reply for a chat Run", async () => {
        const saveChatMessage = vi.fn().mockResolvedValue({ id: "message-a" });
        const deps = {
            resolveProfile: vi.fn().mockResolvedValue({ profile: { agentKey: "orchestrator", name: "统筹", toolAllowlist: [], skillBindings: [], version: 1 }, candidate: { channel: { purpose: "open-source-practice" } }, instructions: "统筹" }),
            callModel: vi.fn().mockResolvedValue({ content: "我们先确认短片时长。" }),
            saveArtifact: vi.fn().mockResolvedValue({ id: "artifact" }),
            saveChatMessage,
            appendEvent: vi.fn(),
        };
        await new ScriptAgentExecutor(deps as never).execute(scope, { projectId: "project-a", runId: "run-chat", chatSessionId: "chat-a", runType: "conversation", input: {}, origin: "https://local", cookie: "session" });
        expect(saveChatMessage).toHaveBeenCalledWith(scope, expect.objectContaining({ sessionId: "chat-a", role: "assistant", agentKey: "orchestrator", publicContent: "我们先确认短片时长。" }));
    });

    it("materializes supervisor revisions before saving its review report", async () => {
        const replaceEpisodes = vi.fn();
        const deps = {
            resolveProfile: vi.fn().mockResolvedValue({ profile: { agentKey: "script_supervisor", name: "编辑", toolAllowlist: [], skillBindings: [], version: 1 }, candidate: { channel: { purpose: "open-source-practice" } }, instructions: "审核" }),
            callModel: vi.fn().mockResolvedValue({ report: "已修正", episodes: [{ episodeNumber: 1, title: "归来", script: { blocks: [{ type: "action", text: "修订正文" }] } }] }),
            saveArtifact: vi.fn().mockResolvedValue({ id: "report" }),
            replaceEpisodes,
            appendEvent: vi.fn(),
        };
        await new ScriptAgentExecutor(deps as never).execute(scope, { projectId: "project-a", runId: "run-review", runType: "script_review", input: {}, origin: "https://local", cookie: "session" });
        expect(replaceEpisodes).toHaveBeenCalledWith(scope, "project-a", "run-review", [expect.objectContaining({ episodeNumber: 1, script: expect.objectContaining({ blocks: expect.any(Array) }) })]);
    });

    it("renders complete episode scripts, storyboard shots and prompt assets as visible text", async () => {
        const episode = await runForVisibleText("episode_scripts", {
            content: "完成",
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
        });
        expect(episode).toContain("第1集：归来");
        expect(episode).toContain("内景 公司 日");
        const storyboard = await runForVisibleText("text_storyboard", {
            content: "完成",
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
        });
        expect(storyboard).toContain("| 1 | 中景 | 她推门 | 推进 | 3秒 |");
        const assets = await runForVisibleText("asset_prompts", { content: "完成", assets: [{ type: "character", name: "女主", prompt: "二十五岁都市女性" }] });
        expect(assets).toContain("女主");
        expect(assets).toContain("二十五岁都市女性");
    });

    it("passes persisted upstream artifacts into the next model call", async () => {
        const callModel = vi.fn(async ({ task }) => ({ content: String(task.input.context?.length || 0) }));
        const deps = {
            resolveProfile: vi.fn().mockResolvedValue({ profile: { agentKey: "adaptation_planner", name: "改编策划", toolAllowlist: [], skillBindings: [], version: 1 }, candidate: { channel: { purpose: "open-source-practice" } }, instructions: "改编" }),
            callModel,
            listArtifacts: vi.fn().mockResolvedValue([{ artifact_type: "short_story", content_text: "完整故事" }]),
            saveArtifact: vi.fn().mockResolvedValue({ id: "artifact" }),
            appendEvent: vi.fn(),
        };
        await new ScriptAgentExecutor(deps as never).execute(scope, { projectId: "project-a", runId: "run-a", runType: "adaptation_bundle", input: {}, origin: "https://local", cookie: "session" });
        expect(callModel).toHaveBeenCalledWith(expect.objectContaining({ task: expect.objectContaining({ input: expect.objectContaining({ context: expect.arrayContaining([expect.objectContaining({ type: "short_story" })]) }) }) }));
    });
});
