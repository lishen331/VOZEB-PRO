import { describe, expect, it, vi } from "vitest";
import { runScriptModel, type ScriptModelRequest } from "./script-practice-model-runtime";

const request: ScriptModelRequest = {
    modelId: "qwen3-script",
    operation: "generate_synopsis",
    projectContext: { title: "夜班车", userId: "must-not-leak", hiddenReasoning: "must-not-send" },
    stageInput: { idea: "一个司机在末班车上发现一名不存在于监控中的乘客" },
    publicInstructions: "只生成公开故事梗概",
    responseSchema: { type: "object", properties: { synopsis: { type: "string" } }, required: ["synopsis"] },
};

const run = async (payload: unknown) => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
    const result = await runScriptModel(request, { endpointUrl: "http://127.0.0.1:43210", executionProfile: "open-source-practice", fetcher });
    expect(fetcher).toHaveBeenCalledOnce();
    return result;
};

describe("script practice model runtime response normalization", () => {
    it("reads text content arrays", async () => {
        await expect(run({ choices: [{ message: { content: [{ type: "text", text: JSON.stringify({ synopsis: "数组梗概" }) }] } }] })).resolves.toMatchObject({ structured: { synopsis: "数组梗概" } });
    });
    it("reads direct result wrappers", async () => {
        await expect(run({ result: { synopsis: "包装梗概" } })).resolves.toMatchObject({ structured: { synopsis: "包装梗概" } });
        await expect(run({ data: { synopsis: "数据梗概" } })).resolves.toMatchObject({ structured: { synopsis: "数据梗概" } });
    });
    it("wraps plain public text for the requested operation", async () => {
        await expect(run({ choices: [{ message: { content: "这是模型返回的公开梗概。" } }] })).resolves.toMatchObject({ structured: { synopsis: "这是模型返回的公开梗概。" } });
    });
    it("reads chat tool-call arguments", async () => {
        await expect(run({ choices: [{ message: { tool_calls: [{ function: { name: "generate_synopsis", arguments: JSON.stringify({ synopsis: "工具梗概" }) } }] } }] })).resolves.toMatchObject({ structured: { synopsis: "工具梗概" } });
    });
    it("reads Responses function-call arguments", async () => {
        await expect(run({ output: [{ type: "function_call", arguments: JSON.stringify({ synopsis: "Responses 梗概" }) }] })).resolves.toMatchObject({ structured: { synopsis: "Responses 梗概" } });
    });
});
