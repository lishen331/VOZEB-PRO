import { describe, expect, it } from "vitest";

import { buildCustomVideoRequestPayload } from "./custom-video-request";

const h3Channel = {
    apiSource: "system" as const,
    baseUrl: "/api/ai/system/channel",
    apiKey: "system" as const,
    apiFormat: "openai" as const,
    model: "MiniMax-H3-Lite",
    capabilityProfile: { keyframeReferenceExclusive: true } as never,
    advancedConfig: {
        protocol: "custom" as const,
        createPath: "/v2/video_generation",
        queryPath: "/v2/query/video_generation/:task_id",
        resultField: "task.content.url",
        statusField: "task.status",
        taskIdField: "task_id",
        requestTemplate: '{"model":"{{model}}","content":"{{content}}","resolution":"{{resolution}}","duration":"{{duration}}","ratio":"{{ratio}}"}',
        modelConfigs: {
            "minimax-h3-lite": {
                protocol: "custom" as const,
                requestTemplate: '{"model":"{{model}}","content":"{{content}}","resolution":"{{resolution}}","duration":"{{duration}}","ratio":"{{ratio}}"}',
                referenceModeExclusive: true,
            },
        },
    } as never,
};

describe("custom video request payload", () => {
    it("renders the channel template with a content array for text-to-video", () => {
        const payload = buildCustomVideoRequestPayload({
            channel: h3Channel as never,
            prompt: "a red ball bouncing",
            raw: { videoSeconds: "4", vquality: "480", size: "16:9" },
            references: [],
        });
        expect(payload).toEqual({
            model: "MiniMax-H3-Lite",
            content: [{ type: "text", text: "a red ball bouncing" }],
            resolution: "480p",
            duration: 4,
            ratio: "16:9",
        });
    });

    it("drops reference materials from content when the task carries a first frame", () => {
        const payload = buildCustomVideoRequestPayload({
            channel: h3Channel as never,
            prompt: "animate",
            raw: { videoSeconds: "4", vquality: "480", size: "16:9" },
            references: [
                { type: "image", role: "first_frame", url: "https://cdn.example/first.png" },
                { type: "image", role: "reference", url: "https://cdn.example/ref.png" },
                { type: "audio", role: "reference", url: "https://cdn.example/a.mp3" },
            ],
        });
        expect(payload.content).toEqual([
            { type: "text", text: "animate" },
            { type: "image_url", role: "first_frame", image_url: { url: "https://cdn.example/first.png" } },
        ]);
    });

    it("sends adaptive ratio for keyframe requests on adaptive_in_keyframe models", () => {
        const channel = { ...h3Channel, capabilityProfile: { keyframeReferenceExclusive: true, videoRatioMode: "adaptive_in_keyframe" } };
        const payload = buildCustomVideoRequestPayload({
            channel: channel as never,
            prompt: "animate",
            raw: { videoSeconds: "4", vquality: "480", size: "16:9" },
            references: [{ type: "image", role: "first_frame", url: "https://cdn.example/first.png" }],
        });
        expect(payload.ratio).toBe("adaptive");
    });

    it("keeps the picked ratio for text-to-video on adaptive_in_keyframe models", () => {
        const channel = { ...h3Channel, capabilityProfile: { keyframeReferenceExclusive: true, videoRatioMode: "adaptive_in_keyframe" } };
        const payload = buildCustomVideoRequestPayload({
            channel: channel as never,
            prompt: "a red ball",
            raw: { videoSeconds: "4", vquality: "480", size: "9:16" },
            references: [],
        });
        expect(payload.ratio).toBe("9:16");
    });

    it("falls back to a full default body when the channel has no template", () => {
        const channel = { ...h3Channel, advancedConfig: { protocol: "custom" as const, createPath: "/v2/video_generation" } };
        const payload = buildCustomVideoRequestPayload({
            channel: channel as never,
            prompt: "a red ball",
            raw: { videoSeconds: "4", vquality: "480", size: "16:9" },
            references: [],
        });
        expect(payload.content).toEqual([{ type: "text", text: "a red ball" }]);
        expect(payload.model).toBe("MiniMax-H3-Lite");
    });
});
