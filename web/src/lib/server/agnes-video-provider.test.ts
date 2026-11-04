import { describe, expect, it } from "vitest";
import { agnesVideoQueryPath, buildAgnesVideoRequest, isAgnesVideoChannel, readAgnesVideoId } from "./agnes-video-provider";

describe("agnes video provider", () => {
    it("sends text mode without media fields when there are no references", () => {
        expect(buildAgnesVideoRequest({ model: "agnes-video-2.5-flash", prompt: "一个小女孩奔跑在田野上", seconds: 5, aspectRatio: "1:1", resolution: "720p" })).toEqual({
            model: "agnes-video-2.5-flash",
            prompt: "一个小女孩奔跑在田野上",
            mode: "text",
            seconds: "5",
            aspect_ratio: "1:1",
            size: "720P",
        });
    });

    it("uses keyframe mode for first and last frames and clamps the duration", () => {
        const request = buildAgnesVideoRequest({
            model: "agnes-video-2.5",
            prompt: "镜头推进",
            seconds: 30,
            references: [
                { type: "image", role: "first_frame", url: "https://cdn.example/first.png" },
                { type: "image", role: "last_frame", url: "https://cdn.example/last.png" },
            ],
        });
        expect(request.mode).toBe("keyframe");
        expect(request.seconds).toBe("12");
        expect(request.first_frame).toBe("https://cdn.example/first.png");
        expect(request.last_frame).toBe("https://cdn.example/last.png");
        expect(request.images).toBeUndefined();
    });

    it("uses reference mode for reference images and audio", () => {
        const request = buildAgnesVideoRequest({
            model: "agnes-video-2.5-flash",
            prompt: "参考角色",
            references: [
                { type: "image", url: "https://cdn.example/character.png" },
                { type: "audio", url: "https://cdn.example/voice.mp3" },
            ],
        });
        expect(request.mode).toBe("reference");
        expect(request.images).toEqual(["https://cdn.example/character.png"]);
        expect(request.audios).toEqual(["https://cdn.example/voice.mp3"]);
    });

    it("reads the retrieval id and only matches Agnes video channels", () => {
        expect(readAgnesVideoId({ id: "task_1", video_id: "vid_1" })).toBe("vid_1");
        expect(readAgnesVideoId({ id: "task_1" })).toBe("");
        expect(agnesVideoQueryPath("agnes-video-2.5-flash")).toBe("/agnesapi?video_id=:task_id&model_name=agnes-video-2.5-flash");
        expect(agnesVideoQueryPath("agnes-video-2.5")).toBe("/agnesapi?video_id=:task_id");
        expect(isAgnesVideoChannel("https://apihub.agnes-ai.com/v1", "agnes-video-2.5")).toBe(true);
        expect(isAgnesVideoChannel("https://api.openai.com/v1", "agnes-video-2.5")).toBe(false);
        expect(isAgnesVideoChannel("https://apihub.agnes-ai.com/v1", "agnes-image-2.1-flash")).toBe(false);
    });
});
