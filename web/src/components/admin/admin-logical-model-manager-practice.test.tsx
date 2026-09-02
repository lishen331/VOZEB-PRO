import { describe, expect, it } from "vitest";

import type { LogicalModel, SystemModelChannel } from "@/lib/auth/store";
import { resolvePracticeWorkflowModelOptions } from "./admin-logical-model-manager";

const model = (id: string, channelId: string): LogicalModel => ({
    id,
    name: id,
    capability: "image",
    enabled: true,
    bindings: [{ id: `${id}-binding`, channelId, upstreamModel: id, enabled: true, priority: 0 }],
});

const channel = (id: string, purpose: SystemModelChannel["purpose"], modelId = id): SystemModelChannel => ({
    id,
    name: id,
    baseUrl: "https://example.test",
    apiKey: "test-key",
    apiFormat: "openai",
    models: [modelId],
    enabled: true,
    purpose,
    advancedConfig: {
        protocol: "openai",
        textModel: "",
        imageModel: modelId,
        videoModel: "",
        createPath: "",
        queryPath: "",
        requestTemplate: "",
        resultField: "",
        statusField: "",
        durationRange: "",
        referenceRule: "",
        supportsReferenceImage: false,
        supportsReferenceVideo: false,
        supportsReferenceAudio: false,
    },
});

describe("practice workflow model options", () => {
    it("keeps shared/open-source models and excludes production-only models", () => {
        expect(
            resolvePracticeWorkflowModelOptions(
                [model("practice-a", "shared"), model("practice-b", "practice"), model("production", "production")],
                [channel("shared", "shared", "practice-a"), channel("practice", "open-source-practice", "practice-b"), channel("production", "production", "production")],
                "image",
            ),
        ).toEqual([
            { label: "practice-a", value: "practice-a" },
            { label: "practice-b", value: "practice-b" },
        ]);
    });
});
