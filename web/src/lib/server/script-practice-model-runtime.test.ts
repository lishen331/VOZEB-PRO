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

describe("script practice model runtime", () => {
    it("sends only the selected stage and public context to the local model", async () => {
        const fetcher = vi.fn(async (_url: string, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body));
            expect(body.model).toBe("qwen3-script");
            expect(JSON.stringify(body)).not.toContain("must-not-leak");
            expect(JSON.stringify(body)).not.toContain("must-not-send");
            return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ synopsis: "一段梗概" }) } }] }), { status: 200 });
        });
        await expect(runScriptModel(request, { endpointUrl: "http://127.0.0.1:43210", executionProfile: "open-source-practice", fetcher })).resolves.toMatchObject({ structured: { synopsis: "一段梗概" } });
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it("does not persist or return hidden reasoning content", async () => {
        const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ synopsis: "公开结果", reasoning: "隐藏思维链" }) } }] }), { status: 200 }));
        const result = await runScriptModel(request, { endpointUrl: "http://127.0.0.1:43210", executionProfile: "open-source-practice", fetcher });
        expect(result.structured).toEqual({ synopsis: "公开结果" });
        expect(JSON.stringify(result)).not.toContain("隐藏思维链");
    });

    it("rejects a runtime that is not scoped to open-source-practice", async () => {
        await expect(runScriptModel(request, { endpointUrl: "http://127.0.0.1:43210", executionProfile: "production", fetcher: vi.fn() })).rejects.toThrow("open-source-practice");
    });
    it("rejects a response that does not match the requested stage schema", async () => {
        const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ outline: "错误字段" }) } }] }), { status: 200 }));
        await expect(runScriptModel(request, { endpointUrl: "http://127.0.0.1:43210", executionProfile: "open-source-practice", fetcher })).rejects.toThrow("结构化结果");
    });

    it("accepts content arrays and direct result wrappers from compatible gateways", async () => {
        const payloads = [{ choices: [{ message: { content: [{ type: "text", text: JSON.stringify({ synopsis: "数组梗概" }) }] } }] }, { result: { synopsis: "包装梗概" } }, { data: { synopsis: "数据梗概" } }];
        for (const payload of payloads) {
            const fetcher = vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 }));
            await expect(runScriptModel(request, { endpointUrl: "http://127.0.0.1:43210", executionProfile: "open-source-practice", fetcher })).resolves.toMatchObject({ structured: { synopsis: expect.any(String) } });
        }
    });

    it("wraps plain text into the requested stage field", async () => {
        const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "这是模型返回的公开梗概。" } }] }), { status: 200 }));
        await expect(runScriptModel(request, { endpointUrl: "http://127.0.0.1:43210", executionProfile: "open-source-practice", fetcher })).resolves.toMatchObject({ structured: { synopsis: "这是模型返回的公开梗概。" } });
    });

    it("reads structured arguments from a chat tool call", async () => {
        const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { tool_calls: [{ function: { name: "generate_synopsis", arguments: JSON.stringify({ synopsis: "工具梗概" }) } }] } }] }), { status: 200 }));
        await expect(runScriptModel(request, { endpointUrl: "http://127.0.0.1:43210", executionProfile: "open-source-practice", fetcher })).resolves.toMatchObject({ structured: { synopsis: "工具梗概" } });
    });
});
