import { describe, expect, it } from "vitest";

import { audioMimeType, joinUrl, qwenCloneRequest, qwenDeleteRequest, qwenDesignRequest, qwenQueryRequest, qwenStatus, upstreamVoicePrefix } from "./custom-voice-upstream";

// 请求体形状必须和百炼官方文档一致，否则真实调用会 400（之前就是因为少了 model / action 一直调不通）。
describe("qwen voice customization requests", () => {
    it("builds a create_voice clone request bound to the target model", () => {
        const body = qwenCloneRequest("qwen-audio-3.1-tts-flash", "vzabc12345", { url: "https://cdn.example.com/ref.mp3" });
        expect(body).toEqual({
            model: "voice-enrollment",
            input: {
                action: "create_voice",
                target_model: "qwen-audio-3.1-tts-flash",
                audio: "https://cdn.example.com/ref.mp3",
                prefix: "vzabc12345",
                language_hints: ["zh"],
            },
        });
    });

    it("sends inline audio as a data uri with the right mime type", () => {
        const body = qwenCloneRequest("qwen-audio-3.1-tts-plus", "vz1", { data: Buffer.from("abc"), format: "wav" });
        expect(body.input.audio).toBe("data:audio/wav;base64,YWJj");
    });

    it("builds a create_voice design request with prompt and preview text", () => {
        const body = qwenDesignRequest("qwen-audio-3.1-tts-flash", "vz1", "沉稳的中年男性", "各位听众朋友们大家好，欢迎收听本期节目");
        expect(body).toEqual({
            model: "voice-enrollment",
            input: {
                action: "create_voice",
                target_model: "qwen-audio-3.1-tts-flash",
                voice_prompt: "沉稳的中年男性",
                preview_text: "各位听众朋友们大家好，欢迎收听本期节目",
                prefix: "vz1",
                language_hints: ["zh"],
            },
            parameters: { response_format: "mp3" },
        });
    });

    it("uses query_voice and delete_voice actions", () => {
        expect(qwenQueryRequest("v-1")).toEqual({ model: "voice-enrollment", input: { action: "query_voice", voice_id: "v-1" } });
        expect(qwenDeleteRequest("v-1")).toEqual({ model: "voice-enrollment", input: { action: "delete_voice", voice_id: "v-1" } });
    });

    it("maps upstream statuses", () => {
        expect(qwenStatus("OK")).toBe("ready");
        expect(qwenStatus("DEPLOYING")).toBe("creating");
        expect(qwenStatus("UNDEPLOYED")).toBe("failed");
        expect(qwenStatus(undefined)).toBeUndefined();
    });
});

describe("upstream helpers", () => {
    // 渠道 baseUrl 已经带 /v1，路径再带 /v1 会拼成 /v1/v1/...
    it("never doubles the /v1 prefix", () => {
        expect(joinUrl("https://api.minimaxi.com/v1", "/voice_clone")).toBe("https://api.minimaxi.com/v1/voice_clone");
        expect(joinUrl("https://dashscope.aliyuncs.com/", "api/v1/services/audio/tts/customization")).toBe("https://dashscope.aliyuncs.com/api/v1/services/audio/tts/customization");
    });

    it("keeps the qwen prefix within letters/digits and 10 chars", () => {
        const prefix = upstreamVoicePrefix("6a8e1f0c-2b44-4c5d-9e33-0f1a2b3c4d5e");
        expect(prefix).toMatch(/^[A-Za-z0-9]{1,10}$/);
        expect(upstreamVoicePrefix("")).toMatch(/^[A-Za-z0-9]{1,10}$/);
    });

    it("maps audio formats to mime types", () => {
        expect(audioMimeType("MP3")).toBe("audio/mpeg");
        expect(audioMimeType("wav")).toBe("audio/wav");
        expect(audioMimeType("m4a")).toBe("audio/mp4");
    });
});
