import { describe, it, expect } from "vitest";
import { synchronizeLogicalModelsWithChannels, resolveLogicalModelCapabilityProfile } from "./model-routing-config";
import type { LogicalModel, SystemModelChannel } from "./auth/store";
describe("HTTP/1.1 binding persistence", () => {
    it.each([true, false])("preserves explicit %s through model synchronization", (value) => {
        const channel: SystemModelChannel = { id: "c", name: "C", apiKey: "test", baseUrl: "https://example.test", apiFormat: "openai", models: ["gpt-image-2"], enabled: true };
        const model: LogicalModel = {
            id: "gpt-image-2",
            name: "Image",
            capability: "image",
            enabled: true,
            bindings: [{ id: "b", channelId: "c", upstreamModel: "gpt-image-2", enabled: true, priority: 1, capabilityProfile: { http1Compatibility: value } }],
        };
        const saved = synchronizeLogicalModelsWithChannels([model], [channel]);
        expect(saved[0].bindings[0].capabilityProfile?.http1Compatibility).toBe(value);
        expect(resolveLogicalModelCapabilityProfile(saved[0].bindings[0], "image", channel, "gpt-image-2")?.http1Compatibility).toBe(value);
    });
});
