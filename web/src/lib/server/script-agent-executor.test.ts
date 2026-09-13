import { describe, expect, it, vi } from "vitest";
import { ScriptAgentExecutor } from "./script-agent-executor";

const scope = { schoolId: "school-a", ownerUserId: "user-a" };
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
