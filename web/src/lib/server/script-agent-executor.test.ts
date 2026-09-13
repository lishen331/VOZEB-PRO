import { describe, expect, it, vi } from "vitest";
import { fetchInternalApi } from "@/lib/server/internal-origin";
import { ScriptAgentExecutor, completedRunTypesForArtifacts, createDefaultScriptAgentExecutor, executeScriptRunSequence, scriptRunSequence, validateScriptAgentArguments } from "./script-agent-executor";

vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: vi.fn(), resolveInternalOrigin: vi.fn((value: string) => value) }));

const scope = { schoolId: "school-a", ownerUserId: "user-a" };
function validOutput(runType: string): Record<string, unknown> {
    if (runType === "short_story") return { title: "故事", content: "完整正文" };
    if (runType === "adaptation_bundle") return { content: "改编", episodes: [{ episodeNumber: 1, title: "第一集", outline: { core: "冲突" } }] };
    if (runType === "episode_scripts" || runType === "script_review") return { content: "剧本", report: "审核", episodes: [{ episodeNumber: 1, title: "第一集", script: { blocks: [{ type: "action", text: "正文" }] } }] };
    if (runType === "text_storyboard")
        return {
            content: "分镜",
            episodes: [
                { episodeNumber: 1, shots: [{ sceneId: "scene-1", shotNumber: 1, visualDescription: "推门", shotSize: "中景", cameraAngle: "平视", composition: "居中", cameraMovement: "推进", action: "推门", emotion: "坚定", durationSeconds: 3 }] },
            ],
        };
    if (runType === "asset_prompts") return { content: "资产", assets: [{ type: "character", name: "女主", prompt: "都市女性" }] };
    return { content: "ok" };
}
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
describe("screenwriter run sequences", () => {
    it("runs supervision inside episode writing and final text deliverables inside directing", async () => {
        expect(scriptRunSequence("episode_scripts")).toEqual(["episode_scripts", "script_review"]);
        expect(scriptRunSequence("director_plan")).toEqual(["director_plan", "text_storyboard", "asset_prompts"]);
        expect(scriptRunSequence("short_story")).toEqual(["short_story"]);
        expect(completedRunTypesForArtifacts(["director_plan", "text_storyboard"])).toEqual(["director_plan", "text_storyboard"]);
        expect(completedRunTypesForArtifacts(["episode_scripts", "review_report"])).toEqual(["episode_scripts", "script_review"]);
        const execute = vi.fn(async (_scope, task) => ({ artifactId: `artifact-${task.runType}` }));
        await expect(executeScriptRunSequence({ execute } as never, scope, { projectId: "project-a", runId: "run-a", runType: "director_plan", input: {}, origin: "https://local", cookie: "session" })).resolves.toMatchObject({
            artifactId: "artifact-asset_prompts",
        });
        expect(execute.mock.calls.map((call) => call[1].runType)).toEqual(["director_plan", "text_storyboard", "asset_prompts"]);
        execute.mockClear();
        await executeScriptRunSequence({ execute } as never, scope, { projectId: "project-a", runId: "run-a", runType: "director_plan", input: {}, origin: "https://local", cookie: "session" }, ["director_plan", "text_storyboard"]);
        expect(execute.mock.calls.map((call) => call[1].runType)).toEqual(["asset_prompts"]);
        execute.mockClear();
        await expect(
            executeScriptRunSequence({ execute } as never, scope, { projectId: "project-a", runId: "run-a", runType: "director_plan", input: {}, origin: "https://local", cookie: "session" }, ["director_plan", "text_storyboard", "asset_prompts"]),
        ).resolves.toMatchObject({ artifactType: "asset_prompts" });
        expect(execute).not.toHaveBeenCalled();
    });
});

describe("ScriptAgentExecutor", () => {
    it("uses the real streaming protocol adapter against an upstream short-story fixture", async () => {
        const upstreamEvents = [{ choices: [{ delta: { content: '{"title":"雨夜",' } }] }, { choices: [{ delta: { content: '"content":"完整小说正文"}' } }] }];
        const fixture = new Response(upstreamEvents.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
        vi.mocked(fetchInternalApi).mockImplementation(async () => fixture.clone());
        let saved: Record<string, unknown> | undefined;
        const repository = {
            listLatestArtifacts: vi.fn().mockResolvedValue([]),
            saveArtifact: vi.fn(async (_scope, input) => {
                saved = input.content;
                return { id: input.id };
            }),
            replaceEpisodes: vi.fn(),
            replaceStoryboardEpisodes: vi.fn(),
            upsertPromptAssets: vi.fn(),
            appendRunEvent: vi.fn(),
            saveChatMessage: vi.fn(),
        };
        const executor = createDefaultScriptAgentExecutor(repository as never);
        const profiles = await import("./script-agent-profiles");
        vi.spyOn(profiles.ScriptAgentProfileService.prototype, "resolve").mockResolvedValueOnce({
            profile: {
                agentKey: "novel_writer",
                name: "小说作者",
                enabled: true,
                primaryLogicalModelId: "writer",
                fallbackLogicalModelId: "",
                reasoningMode: "medium",
                outputPolicy: {},
                timeoutConfig: {},
                batchConfig: {},
                toolAllowlist: [],
                skillBindings: [],
                version: 1,
            },
            candidate: {
                logicalModelId: "writer",
                upstreamModel: "deepseek-chat",
                channelId: "practice-channel",
                channel: { id: "practice-channel", enabled: true, purpose: "open-source-practice", baseUrl: "https://fixture.invalid/v1", apiKey: "hidden", apiFormat: "newapi", models: ["deepseek-chat"], advancedConfig: {} } as never,
            },
            instructions: "输出完整小说体短故事",
        });
        await executor.execute(scope, { projectId: "project-a", runId: "run-fixture", runType: "short_story", input: { idea: "雨夜重生" }, origin: "https://local", cookie: "session" });
        expect(saved).toEqual({ title: "雨夜", content: "完整小说正文" });
        expect(vi.mocked(fetchInternalApi)).toHaveBeenCalledTimes(1);
        expect(JSON.parse(String(vi.mocked(fetchInternalApi).mock.calls[0]?.[1]?.body))).toMatchObject({ stream: true, model: "deepseek-chat" });
        vi.mocked(fetchInternalApi).mockReset();
    });

    it("forwards the Run abort signal to the configured model call", async () => {
        const signal = new AbortController().signal;
        const callModel = vi.fn().mockResolvedValue({ content: "完成" });
        const deps = {
            resolveProfile: vi.fn().mockResolvedValue({ profile: { agentKey: "novel_planner", name: "策划", toolAllowlist: [], skillBindings: [], version: 1 }, candidate: { channel: { purpose: "open-source-practice" } }, instructions: "策划" }),
            callModel,
            saveArtifact: vi.fn().mockResolvedValue({ id: "artifact" }),
            appendEvent: vi.fn(),
        };
        await new ScriptAgentExecutor(deps as never).execute(scope, { projectId: "project-a", runId: "run-stop", runType: "project_planning", input: {}, origin: "https://local", cookie: "session", signal });
        expect(callModel).toHaveBeenCalledWith(expect.objectContaining({ task: expect.objectContaining({ signal }) }));
    });

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
    it("rejects natural text and malformed nested rows before accepting a model response", () => {
        expect(validateScriptAgentArguments("short_story", "普通自然语言")).toBe(false);
        expect(validateScriptAgentArguments("episode_scripts", JSON.stringify({ content: "完成", episodes: [{ episodeNumber: 1, title: "第一集", script: { blocks: [] } }] }))).toBe(false);
        expect(validateScriptAgentArguments("text_storyboard", JSON.stringify({ content: "完成", episodes: [{ episodeNumber: 1, shots: [{}] }] }))).toBe(false);
        expect(validateScriptAgentArguments("asset_prompts", JSON.stringify({ content: "完成", assets: [{}] }))).toBe(false);
        expect(validateScriptAgentArguments("short_story", JSON.stringify({ title: "雨夜", content: "完整小说正文" }))).toBe(true);
    });

    it("rejects a stage result that omits its required structured data", async () => {
        const deps = {
            resolveProfile: vi.fn().mockResolvedValue({ profile: { agentKey: "adaptation_planner", name: "改编", toolAllowlist: [], skillBindings: [], version: 1 }, candidate: { channel: { purpose: "open-source-practice" } }, instructions: "改编" }),
            callModel: vi.fn().mockResolvedValue({ content: "只有普通说明，没有分集" }),
            saveArtifact: vi.fn(),
            appendEvent: vi.fn(),
        };
        await expect(new ScriptAgentExecutor(deps as never).execute(scope, { projectId: "project-a", runId: "run-invalid", runType: "adaptation_bundle", input: {}, origin: "https://local", cookie: "session" })).rejects.toThrow("结构");
        expect(deps.saveArtifact).not.toHaveBeenCalled();
    });

    it("uses a concrete structured output schema for every short-film stage", async () => {
        const schemas: Array<Record<string, unknown>> = [];
        const deps = {
            resolveProfile: vi.fn().mockResolvedValue({ profile: { agentKey: "novel_planner", name: "策划", toolAllowlist: [], skillBindings: [], version: 1 }, candidate: { channel: { purpose: "open-source-practice" } }, instructions: "策划" }),
            callModel: vi.fn(async ({ responseSchema, task }) => {
                schemas.push(responseSchema);
                return validOutput(task.runType);
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

    it("preserves the project idea in planning and forwards it to the short-story writer", async () => {
        const callModel = vi.fn(async ({ task }) => (task.runType === "project_planning" ? { content: String(task.input.idea || "") } : { title: "雨夜", content: "完整正文" }));
        const artifacts: Record<string, unknown>[] = [];
        const deps = {
            resolveProfile: vi.fn().mockResolvedValue({ profile: { agentKey: "novel_planner", name: "策划", toolAllowlist: [], skillBindings: [], version: 1 }, candidate: { channel: { purpose: "open-source-practice" } }, instructions: "策划" }),
            callModel,
            listArtifacts: vi.fn(async () => artifacts),
            saveArtifact: vi.fn(async (_scope, input) => {
                artifacts.push({ artifact_type: input.artifactType, artifact_key: input.artifactKey, status: input.status, content_json: input.content });
                return { id: input.id };
            }),
            appendEvent: vi.fn(),
        };
        const executor = new ScriptAgentExecutor(deps as never);
        await executor.execute(scope, { projectId: "project-a", runId: "run-plan", runType: "project_planning", input: { idea: "雨夜重生" }, origin: "https://local", cookie: "session" });
        await executor.execute(scope, { projectId: "project-a", runId: "run-story", runType: "short_story", input: {}, origin: "https://local", cookie: "session" });
        expect(callModel.mock.calls[1]?.[0].task.input.context).toEqual(expect.arrayContaining([expect.objectContaining({ type: "creative_positioning", content: expect.objectContaining({ content: "雨夜重生" }) })]));
    });

    it("passes persisted upstream artifacts into the next model call", async () => {
        const callModel = vi.fn(async ({ task }) => ({ content: String(task.input.context?.length || 0), episodes: [{ episodeNumber: 1, title: "第一集", outline: { core: "冲突" } }] }));
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
