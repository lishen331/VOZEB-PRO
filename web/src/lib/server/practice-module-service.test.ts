import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requirePracticeAccess: vi.fn(), getAuthSettings: vi.fn() }));
vi.mock("./practice-access-service", () => ({ requirePracticeAccess: mocks.requirePracticeAccess }));
vi.mock("@/lib/auth/store", () => ({ getAuthSettings: mocks.getAuthSettings }));

import { listPracticeModuleCapabilities, resolvePracticeModuleModelOptions } from "./practice-module-service";
import type { AuthSettings } from "@/lib/auth/store";

function settings(): AuthSettings {
    const channel = (id: string, purpose: "open-source-practice" | "production", workflow = true) => ({
        id,
        name: id,
        baseUrl: "https://example.test",
        apiKey: "key",
        apiFormat: "openai" as const,
        models: ["upstream-image"],
        enabled: true,
        purpose,
        advancedConfig: {
            protocol: "runninghub" as const,
            textModel: "",
            imageModel: "upstream-image",
            videoModel: "",
            createPath: "/create",
            queryPath: "/query",
            requestTemplate: "{}",
            resultField: "data.result",
            statusField: "data.status",
            durationRange: "",
            referenceRule: "",
            supportsReferenceImage: true,
            supportsReferenceVideo: false,
            supportsReferenceAudio: false,
            workflowConfigs: workflow
                ? {
                      current: {
                          workflowKey: "current",
                          workflowCode: "storyboard_shot",
                          workflowName: "分镜图工作流",
                          businessCode: "storyboard-image" as const,
                          capability: "image" as const,
                          providerType: "runninghub" as const,
                          channelId: id,
                          workflowId: "workflow-internal",
                          version: 1,
                          enabled: true,
                          createPath: "/create",
                          queryPath: "/query",
                          taskIdField: "data.id",
                          statusField: "data.status",
                          resultField: "data.result",
                          requestTemplate: "{}",
                          inputSchema: [],
                          nodeMappings: [],
                          outputMappings: [],
                      },
                  }
                : {},
        },
    });
    return {
        practiceWorkflowModels: { "storyboard-image": ["practice-image-a", "practice-image-b"] },
        logicalModels: [
            {
                id: "practice-image-a",
                name: "分镜图模型 A",
                capability: "image",
                enabled: true,
                bindings: [{ id: "a", channelId: "practice", upstreamModel: "upstream-image", enabled: true, priority: 1 }],
            },
            {
                id: "practice-image-b",
                name: "分镜图模型 B",
                capability: "image",
                enabled: true,
                bindings: [{ id: "b", channelId: "production", upstreamModel: "upstream-image", enabled: true, priority: 1 }],
            },
            {
                id: "disabled",
                name: "禁用模型",
                capability: "image",
                enabled: false,
                bindings: [{ id: "disabled", channelId: "practice", upstreamModel: "upstream-image", enabled: true, priority: 1 }],
            },
        ],
        systemChannels: [channel("practice", "open-source-practice"), channel("production", "production")],
    } as AuthSettings;
}

describe("practice module capabilities", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requirePracticeAccess.mockResolvedValue({ schoolId: "school-one", membershipId: "member-one", role: "teacher" });
    });

    it("returns only visible Demo modules", async () => {
        const current = settings();
        current.practiceModuleVisibility = {
            canvas: false,
            drama: false,
            character: true,
            scene: false,
            prop: true,
            "storyboard-image": true,
            "storyboard-video": true,
            dubbing: true,
        };
        const capabilities = await listPracticeModuleCapabilities({ id: "teacher-one" }, { settings: current });
        expect(capabilities.map((item) => item.module)).toEqual(["character", "prop", "storyboard-image", "storyboard-video", "dubbing"]);
    });
    it("returns the six Demo modules with only enabled open-source workflow models", async () => {
        const capabilities = await listPracticeModuleCapabilities({ id: "teacher-one" }, { settings: settings() });
        expect(capabilities.map((item) => item.module)).toEqual(["character", "scene", "prop", "storyboard-image", "storyboard-video", "dubbing"]);
        expect(capabilities.find((item) => item.module === "storyboard-image")?.models).toEqual([{ id: "current", label: "分镜图工作流" }]);
        expect(JSON.stringify(capabilities)).not.toContain("workflow-internal");
        expect(JSON.stringify(capabilities)).not.toContain("channelId");
    });

    it("exposes only public Demo workflow codes for asset practice options", async () => {
        const current = settings();
        const channel = current.systemChannels[0];
        const workflow = channel.advancedConfig?.workflowConfigs?.current;
        if (!workflow || !channel.advancedConfig) throw new Error("missing fixture workflow");
        channel.advancedConfig.workflowConfigs = {
            ...channel.advancedConfig.workflowConfigs,
            character: { ...workflow, workflowKey: "character-key", workflowCode: "character_main_view", workflowName: "角色主形象图", businessCode: "storyboard-image", lastTestResult: "success" },
            characterMulti: { ...workflow, workflowKey: "character-multi-key", workflowCode: "character_multi_view", workflowName: "角色多视图", businessCode: "storyboard-image", lastTestResult: "success" },
        };
        channel.advancedConfig.workflowConfigs.characterMulti = {
            ...channel.advancedConfig.workflowConfigs.characterMulti,
            inputSchema: [
                { key: "referenceImage", label: "主形象", type: "image", required: true },
                { key: "frontPrompt", label: "正视图", type: "text", required: false },
            ],
        };
        const capabilities = await listPracticeModuleCapabilities({ id: "teacher-one" }, { settings: current });
        expect(capabilities.find((item) => item.module === "character")?.workflowOptions).toMatchObject([
            { code: "character_main_view", label: "角色主形象图" },
            { code: "character_multi_view", label: "角色多视图" },
        ]);
        const character = capabilities.find((item) => item.module === "character")!;
        expect(character.inputSchema.map((field) => field.key)).not.toContain("frontPrompt");
        expect(character.workflowOptions?.find((option) => option.code === "character_multi_view")).toMatchObject({ inputSchema: expect.arrayContaining([{ key: "frontPrompt", label: "正视图", type: "text", required: false }]) });
        expect(new Set(character.inputSchema.map((field) => field.key)).size).toBe(character.inputSchema.length);
        expect(JSON.stringify(capabilities)).not.toContain("workflow-internal");
        expect(JSON.stringify(capabilities)).not.toContain("workflowKey");
    });

    it("marks a module unavailable when its model or workflow cannot be used", async () => {
        const current = settings();
        current.practiceWorkflowModels = { "storyboard-image": ["disabled"] };
        const image = (await listPracticeModuleCapabilities({ id: "teacher-one" }, { settings: current })).find((item) => item.module === "storyboard-image");
        expect(image).toMatchObject({ available: true, models: [{ id: "current" }] });
    });

    it("projects an enabled RunningHub workflow without reading logical model bindings", () => {
        const current = settings();
        current.practiceWorkflowModels = { "storyboard-image": ["missing-model"] };
        current.logicalModels = [];
        expect(resolvePracticeModuleModelOptions(current, "storyboard-image")).toEqual([{ id: "current", label: "分镜图工作流" }]);
    });

    it("does not fall back to practice default models when no workflow is enabled", () => {
        const current = settings();
        current.practiceDefaultModels = { ...current.practiceDefaultModels, imageModel: "practice-image-a" };
        current.systemChannels[0].advancedConfig!.workflowConfigs = {};
        expect(resolvePracticeModuleModelOptions(current, "storyboard-image")).toEqual([]);
    });

    it("exposes declared scalar workflow fields needed by specialized practice forms", async () => {
        const current = settings();
        const channel = current.systemChannels[0];
        const workflow = channel.advancedConfig?.workflowConfigs?.current;
        if (!workflow || !channel.advancedConfig) throw new Error("missing fixture workflow");
        channel.advancedConfig.workflowConfigs = {
            current: {
                ...workflow,
                workflowCode: "character_main_view",
                businessCode: "storyboard-image",
                lastTestResult: "success",
                inputSchema: [
                    { key: "prompt", label: "描述", type: "text", required: true },
                    { key: "width", label: "宽", type: "number", required: true, defaultValue: 720 },
                    { key: "height", label: "高", type: "number", required: true, defaultValue: 1280 },
                ],
            },
        };
        const character = (await listPracticeModuleCapabilities({ id: "teacher-one" }, { settings: current })).find((item) => item.module === "character");
        expect(character?.inputSchema).toEqual(
            expect.arrayContaining([
                { key: "width", label: "宽", type: "number", required: true, defaultValue: 720 },
                { key: "height", label: "高", type: "number", required: true, defaultValue: 1280 },
            ]),
        );
    });
});
