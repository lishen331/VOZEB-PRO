import { describe, expect, it, vi } from "vitest";
import { ScriptAgentProfileService } from "./script-agent-profiles";

const settings = {
    practiceDefaultModels: { textModel: "practice-writer", imageModel: "", videoModel: "", audioModel: "", visionModel: "" },
    practiceScriptSettings: { defaultModelId: "practice-writer", fallbackModelId: "", endpointId: "" },
    logicalModels: [{ id: "practice-writer", name: "Writer", capability: "text", enabled: true, bindings: [{ id: "b", channelId: "practice-channel", upstreamModel: "deepseek-chat", enabled: true, priority: 1 }] }],
    systemChannels: [{ id: "practice-channel", name: "Practice", purpose: "open-source-practice", enabled: true, baseUrl: "https://example.test/v1", models: ["deepseek-chat"], apiKey: "secret", advancedConfig: { protocol: "openai" } }],
};

describe("ScriptAgentProfileService", () => {
    it("resolves a fresh open-source-practice text model", async () => {
        const getSettings = vi.fn().mockResolvedValue(settings);
        const getProfile = vi.fn().mockResolvedValue({
            agentKey: "novel_writer",
            name: "小说作者",
            enabled: true,
            primaryLogicalModelId: "practice-writer",
            fallbackLogicalModelId: "",
            reasoningMode: "medium",
            outputPolicy: {},
            timeoutConfig: {},
            batchConfig: {},
            toolAllowlist: ["save_chapter"],
            skillBindings: ["core-novel-writer"],
            version: 2,
        });
        const service = new ScriptAgentProfileService({ getSettings: getSettings as never, getProfile });
        const first = await service.resolve("novel_writer");
        await service.resolve("novel_writer");
        expect(first.candidate.channel.purpose).toBe("open-source-practice");
        expect(first.candidate.upstreamModel).toBe("deepseek-chat");
        expect(first.instructions).toContain("小说写作");
        expect(getSettings).toHaveBeenCalledTimes(2);
        expect(getProfile).toHaveBeenCalledTimes(2);
    });
});
