import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { AuthSettings } from "@/lib/auth/store";
import { buildPracticeSettingsPatch, practiceScriptModelOptions, practiceScriptChannelOptions } from "./admin-practice-section";

const settings = {
    practiceScriptSettings: {
        enabled: true,
        defaultModelId: "writer",
        fallbackModelId: "",
        endpointId: "",
        defaultLanguage: "zh-CN",
        defaultFormat: "structured",
        enabledSkills: [],
        enabledTools: [],
        agentWorkflowVersion: 1,
        writeConfirmation: "always",
        creativeControlsEnabled: true,
    },
    practiceModuleVisibility: { canvas: false, drama: false, character: true, scene: true, prop: true, "storyboard-image": true, "storyboard-video": true, dubbing: true },
    logicalModels: [
        { id: "writer", name: "剧本写作", capability: "text", enabled: true, bindings: [{ id: "b1", channelId: "practice", upstreamModel: "qwen3", enabled: true, priority: 1 }] },
        { id: "image", name: "图片模型", capability: "image", enabled: true, bindings: [] },
    ],
    systemChannels: [
        { id: "practice", name: "练习渠道", baseUrl: "http://localhost", apiKey: "", apiFormat: "openai", models: ["qwen3"], enabled: true, purpose: "open-source-practice" },
        { id: "production", name: "生产渠道", baseUrl: "http://localhost", apiKey: "", apiFormat: "openai", models: ["gpt"], enabled: true, purpose: "production" },
    ],
} as unknown as AuthSettings;

describe("admin infinite practice configuration", () => {
    it("offers only text logical models and non-production endpoints", () => {
        expect(practiceScriptModelOptions(settings)).toEqual([{ value: "writer", label: "剧本写作" }]);
        expect(practiceScriptChannelOptions(settings, "writer")).toEqual([{ value: "practice", label: "练习渠道" }]);
    });

    it("saves module visibility together with script settings", () => {
        const patch = buildPracticeSettingsPatch(settings as unknown as AuthSettings);
        expect(patch).toEqual(expect.objectContaining({ practiceScriptSettings: expect.anything(), practiceModuleVisibility: expect.anything() }));
    });

    it("exposes an independent admin section and real configuration labels", async () => {
        const sections = await readFile(resolve(process.cwd(), "src/components/admin/admin-sections.ts"), "utf8");
        const nav = await readFile(resolve(process.cwd(), "src/components/admin/admin-section-nav.tsx"), "utf8");
        expect(sections).toContain('"practice"');
        expect(nav).toContain('key: "practice"');
        const page = await readFile(resolve(process.cwd(), "src/components/admin/admin-practice-section.tsx"), "utf8");
        expect(page).toContain("剧本生成模型");
        expect(page).toContain("enabledTools");
        expect(page).not.toContain("create_image_task");
    });
});
