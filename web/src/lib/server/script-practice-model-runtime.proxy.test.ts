import { describe, expect, it, vi } from "vitest";
import { runScriptModel, type ScriptModelRequest } from "./script-practice-model-runtime";

const mocks = vi.hoisted(() => ({ requestStructuredText: vi.fn() }));
vi.mock("./text-planning-runtime", () => ({ requestStructuredText: mocks.requestStructuredText }));

const request: ScriptModelRequest = {
    modelId: "qwen3-script",
    operation: "generate_synopsis",
    projectContext: { title: "夜班车" },
    stageInput: { idea: "末班车" },
    publicInstructions: "生成公开梗概",
    responseSchema: { type: "object", required: ["synopsis"] },
};

describe("script model runtime unified protocol", () => {
    it("uses the shared text protocol proxy for configured practice models", async () => {
        mocks.requestStructuredText.mockResolvedValue({ arguments: JSON.stringify({ synopsis: "统一代理梗概" }), headers: new Headers(), protocol: "chat", elapsedMs: 10 });
        await expect(
            runScriptModel(request, {
                endpointUrl: "https://unused.example",
                executionProfile: "open-source-practice",
                origin: "https://app.example",
                cookie: "session=redacted",
                logicalModelId: "script-writer",
                userId: "user-a",
                requestId: "script-request-a",
                candidate: {
                    logicalModelId: "script-writer",
                    channelId: "practice-channel",
                    upstreamModel: "qwen3-script",
                    channel: {
                        id: "practice-channel",
                        name: "练习模型",
                        baseUrl: "https://provider.example",
                        apiKey: "secret",
                        apiFormat: "openai",
                        models: ["qwen3-script"],
                        enabled: true,
                        advancedConfig: {
                            protocol: "custom",
                            textModel: "",
                            imageModel: "",
                            videoModel: "",
                            queryPath: "",
                            requestTemplate: '{"input":"{{prompt}}"}',
                            resultField: "data",
                            createPath: "/generate",
                            editPath: "",
                            imageToVideoPath: "",
                            statusField: "",
                            durationRange: "",
                            referenceRule: "",
                            supportsReferenceImage: false,
                            supportsReferenceVideo: false,
                            supportsReferenceAudio: false,
                        },
                    },
                },
            }),
        ).resolves.toMatchObject({ structured: { synopsis: "统一代理梗概" } });
        expect(mocks.requestStructuredText).toHaveBeenCalledWith(
            expect.objectContaining({
                origin: "https://app.example",
                cookie: "session=redacted",
                candidate: expect.objectContaining({ channelId: "practice-channel" }),
                tool: expect.objectContaining({ name: "generate_synopsis" }),
            }),
        );
    });
});
