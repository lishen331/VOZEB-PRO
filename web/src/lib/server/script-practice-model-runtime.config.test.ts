import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getFreshAuthSettings: vi.fn(),
    resolveLogicalModel: vi.fn(),
}));
vi.mock("@/lib/auth/store", () => ({ getFreshAuthSettings: mocks.getFreshAuthSettings }));
vi.mock("@/lib/server/logical-model-router", () => ({ resolveLogicalModel: mocks.resolveLogicalModel }));

import { resolveConfiguredScriptModel } from "./script-practice-model-runtime";

describe("configured script model runtime", () => {
    it("resolves the open-source-practice text model from admin settings", async () => {
        mocks.getFreshAuthSettings.mockResolvedValue({
            practiceScriptSettings: { defaultModelId: "script-writer", fallbackModelId: "", endpointId: "" },
            practiceDefaultModels: { textModel: "", imageModel: "", videoModel: "", audioModel: "" },
            logicalModels: [],
            systemChannels: [],
        });
        mocks.resolveLogicalModel.mockReturnValue({
            logicalModelId: "script-writer",
            upstreamModel: "qwen3",
            channelId: "local-script",
            channel: { id: "local-script", name: "本地剧本模型", baseUrl: "http://127.0.0.1:43210/v1", apiKey: "secret", apiFormat: "openai", models: ["qwen3"], enabled: true, purpose: "open-source-practice" },
        });
        await expect(resolveConfiguredScriptModel()).resolves.toEqual({ modelId: "qwen3", endpointUrl: "http://127.0.0.1:43210/v1", apiKey: "secret", executionProfile: "open-source-practice" });
        expect(mocks.resolveLogicalModel).toHaveBeenCalledWith(expect.anything(), "text", "script-writer", "", "open-source-practice");
    });

    it("fails closed when no open-source-practice model is configured", async () => {
        mocks.getFreshAuthSettings.mockResolvedValue({ practiceScriptSettings: { defaultModelId: "", fallbackModelId: "" }, practiceDefaultModels: { textModel: "", imageModel: "", videoModel: "", audioModel: "" }, logicalModels: [], systemChannels: [] });
        mocks.resolveLogicalModel.mockReturnValue(null);
        await expect(resolveConfiguredScriptModel()).rejects.toThrow("剧本模型尚未配置");
    });
});
