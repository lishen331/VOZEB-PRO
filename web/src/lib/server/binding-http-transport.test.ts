import { describe, expect, it } from "vitest";
import { bindingUsesHttp1 } from "./binding-http-transport";

const models = [
    {
        id: "image",
        name: "Image",
        enabled: true,
        capability: "image" as const,
        bindings: [
            { id: "a", channelId: "rabbit", upstreamModel: "image-v1", enabled: true, priority: 1, capabilityProfile: { http1Compatibility: true } },
            { id: "b", channelId: "other", upstreamModel: "image-v1", enabled: true, priority: 1 },
        ],
    },
];
describe("binding HTTP transport", () => {
    it("only enables the exact logical model/channel/upstream binding", () => {
        expect(bindingUsesHttp1(models, "image", "rabbit", "image-v1")).toBe(true);
        expect(bindingUsesHttp1(models, "image", "other", "image-v1")).toBe(false);
        expect(bindingUsesHttp1(models, "video", "rabbit", "image-v1")).toBe(false);
        expect(bindingUsesHttp1(models, "image", "rabbit", "video-v1")).toBe(false);
    });
    it("off and disabled bindings do not enable compatibility", () => {
        expect(bindingUsesHttp1([{ ...models[0], bindings: [{ ...models[0].bindings[0], enabled: false }] }], "image", "rabbit", "image-v1")).toBe(false);
        expect(bindingUsesHttp1([{ ...models[0], bindings: [{ ...models[0].bindings[0], capabilityProfile: { http1Compatibility: false } }] }], "image", "rabbit", "image-v1")).toBe(false);
    });
});
