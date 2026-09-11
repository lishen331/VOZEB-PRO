import { describe, expect, it } from "vitest";
import { assertPracticeScriptSettingsPatch, normalizePracticeScriptSettings, publicPracticeScriptSettings } from "./practice-script-settings";

describe("practice script settings", () => {
    it("normalizes settings inside infinite practice only", () =>
        expect(normalizePracticeScriptSettings({ enabled: 0, defaultFormat: "fountain", agentWorkflowVersion: 3, enabledSkills: ["outline", "outline", 2] })).toMatchObject({
            enabled: true,
            defaultFormat: "fountain",
            agentWorkflowVersion: 3,
            enabledSkills: ["outline"],
        }));
    it("never accepts a commercial channel in script settings", () =>
        expect(normalizePracticeScriptSettings({ endpointId: "production-channel", defaultModelId: "commercial-model" })).toMatchObject({ endpointId: "production-channel", defaultModelId: "commercial-model" }));
    it("rejects fields outside the script settings boundary", () => expect(() => assertPracticeScriptSettingsPatch({ productionChannelId: "x" })).toThrow("不支持的字段"));
    it("does not expose endpoint or tool secrets", () =>
        expect(publicPracticeScriptSettings({ endpointId: "secret-endpoint", enabledTools: ["internal-tool"], defaultModelId: "script-model" })).toEqual({
            enabled: true,
            defaultModelId: "script-model",
            fallbackModelId: "",
            defaultLanguage: "zh-CN",
            defaultFormat: "structured",
            agentWorkflowVersion: 1,
            creativeControlsEnabled: true,
        }));
});
