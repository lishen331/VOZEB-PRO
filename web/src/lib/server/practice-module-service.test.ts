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

    it("returns a manual script and only enabled open-source workflow models", async () => {
        const capabilities = await listPracticeModuleCapabilities({ id: "teacher-one" }, { settings: settings() });
        expect(capabilities.find((item) => item.module === "script")).toMatchObject({ mode: "manual", available: true, models: [], outputType: "text" });
        expect(capabilities.find((item) => item.module === "storyboard-image")?.models).toEqual([{ id: "practice-image-a", label: "分镜图模型 A" }]);
        expect(JSON.stringify(capabilities)).not.toContain("workflow-internal");
        expect(JSON.stringify(capabilities)).not.toContain("channelId");
    });

    it("marks a module unavailable when its model or workflow cannot be used", async () => {
        const current = settings();
        current.practiceWorkflowModels = { "storyboard-image": ["disabled"] };
        const image = (await listPracticeModuleCapabilities({ id: "teacher-one" }, { settings: current })).find((item) => item.module === "storyboard-image");
        expect(image).toMatchObject({ available: false, models: [], unavailableReason: "当前模块暂无可用开源模型" });
    });

    it("resolves model options without exposing production-only bindings", () => {
        expect(resolvePracticeModuleModelOptions(settings(), "storyboard-image")).toEqual([{ id: "practice-image-a", label: "分镜图模型 A" }]);
    });
});
