import { describe, expect, it } from "vitest";
import { applyChannelProtocol, channelProtocolDefinition, emptyAdvancedConfig, protocolModelConfig } from "./channel-protocol-registry";
import { normalizeSystemChannelAdvancedConfig } from "./auth/store-normalizers-channel";
import { resolveTextProtocol } from "./server/text-protocol-resolver";
import { agnesVideoQueryPath, buildAgnesVideoRequest, isAgnesVideoChannel, readAgnesVideoId } from "./server/agnes-video-provider";
import type { SystemModelChannel } from "./auth/store-types";

describe("Agnes explicit protocol contract", () => {
    it("registers text/image/video, and preserves channel identity, keys, switches and selected models", () => {
        const channel: SystemModelChannel = {
            id: "existing",
            name: "OpenAI 渠道",
            baseUrl: "https://apihub.agnes-ai.com/v1",
            apiKey: "fixture-key",
            enabled: true,
            practiceEnabled: true,
            apiFormat: "openai",
            models: ["agnes-image-2.1-flash", "agnes-image-2.5-flash"],
            advancedConfig: emptyAdvancedConfig(),
        };
        const next = applyChannelProtocol(channel, "agnes");
        expect(next).toMatchObject({ id: channel.id, apiKey: channel.apiKey, enabled: true, practiceEnabled: true, models: channel.models, advancedConfig: { protocol: "agnes" } });
        expect(channelProtocolDefinition("agnes").capabilities).toEqual(["text", "image", "video"]);
        expect(normalizeSystemChannelAdvancedConfig(next.advancedConfig)?.protocol).toBe("agnes");
        expect(protocolModelConfig("agnes", "image")?.editPath).toBe("/images/generations");
        expect(resolveTextProtocol({ model: "agnes-2.5-flash", apiFormat: "openai", advancedConfig: next.advancedConfig })).toMatchObject({ kind: "chat", path: "/chat/completions" });
    });
    it("uses model-specific query paths and Flash reference limits", () => {
        expect(protocolModelConfig("agnes", "video", "agnes-video-2.5")?.queryPath).toBe("/agnesapi?video_id=:task_id&model_name=agnes-video-2.5");
        expect(protocolModelConfig("agnes", "video", "agnes-video-2.5-flash")?.supportsReferenceVideo).toBe(false);
        expect(protocolModelConfig("agnes", "video", "agnes-video-2.5")?.supportsReferenceVideo).toBe(true);
    });
    it("selects Agnes by explicit protocol even through the internal system proxy", () => {
        expect(isAgnesVideoChannel("/api/ai/system/fixture", "agnes-video-2.5", "agnes")).toBe(true);
    });
    it("converts the canvas numeric quality and persists a model-qualified retrieval path", () => {
        expect(buildAgnesVideoRequest({ model: "agnes-video-2.5-flash", prompt: "原始提示词", seconds: "5", aspectRatio: "1:1", resolution: "720" })).toMatchObject({ mode: "text", seconds: "5", size: "720P", aspect_ratio: "1:1" });
        expect(agnesVideoQueryPath("agnes-video-2.5")).toBe("/agnesapi?video_id=:task_id&model_name=agnes-video-2.5");
        expect(readAgnesVideoId({ id: "queue-job", task_id: "task-job", video_id: "actual-video" })).toBe("actual-video");
    });
    it("rejects incompatible explicit parameters rather than silently truncating them", () => {
        expect(() => buildAgnesVideoRequest({ model: "agnes-video-2.5-flash", prompt: "test", resolution: "1080" })).toThrow(/720P/);
        expect(() => buildAgnesVideoRequest({ model: "agnes-video-2.5", prompt: "test", seconds: 30 })).toThrow(/4.*12/);
        expect(() => buildAgnesVideoRequest({ model: "agnes-video-2.5-flash", prompt: "test", references: [{ type: "video", url: "https://fixture.invalid/clip.mp4" }] })).toThrow(/视频/);
    });
    it("preserves standard model video reference URLs and rejects mixed frame/reference mode", () => {
        expect(buildAgnesVideoRequest({ model: "agnes-video-2.5", prompt: "原始提示词", resolution: "2K", references: [{ type: "video", url: "https://fixture.invalid/clip.mp4" }] })).toMatchObject({
            mode: "reference",
            videos: [{ url: "https://fixture.invalid/clip.mp4" }],
            size: "2K",
        });
        expect(() =>
            buildAgnesVideoRequest({
                model: "agnes-video-2.5",
                prompt: "test",
                references: [
                    { type: "image", role: "first_frame", url: "https://fixture.invalid/start.png" },
                    { type: "audio", url: "https://fixture.invalid/a.wav" },
                ],
            }),
        ).toThrow(/首尾帧/);
    });
});
