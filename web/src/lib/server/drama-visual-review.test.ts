import { describe, expect, it } from "vitest";

import { normalizeDramaVisualReviewInput } from "./drama-visual-review";

describe("normalizeDramaVisualReviewInput", () => {
    it("keeps only reviewable server or https storyboard images", () => {
        const result = normalizeDramaVisualReviewInput({
            project: { title: "短剧", summary: "悬疑", style: "现实电影感", ratio: "9:16" },
            episode: {
                title: "第 1 集",
                shots: [
                    { id: "shot-one", title: "发现", imagePrompt: "雨夜", storyboardImageUrl: "/api/media-assets/one", storyboardEndImageUrl: "https://example.com/end.png" },
                    { id: "shot-two", title: "无图", storyboardImageUrl: "blob:expired" },
                ],
            },
        });

        expect(result.tasks).toEqual([expect.objectContaining({ id: "shot-one", imageUrls: ["/api/media-assets/one", "https://example.com/end.png"] })]);
        expect(result.foundation.direction.avoid).toContain("轴线与视线错误");
    });

    it("reviews every completed storyboard instead of sampling the first six", () => {
        const shots = Array.from({ length: 21 }, (_, index) => ({ id: `shot-${index}`, title: `镜头 ${index}`, imagePrompt: `提示词 ${index}`, storyboardImageUrl: `/api/media-assets/${index}` }));

        const result = normalizeDramaVisualReviewInput({ project: { title: "长剧集", ratio: "9:16" }, episode: { title: "第 1 集", shots } });

        expect(result.tasks).toHaveLength(21);
        expect(result.tasks.at(-1)).toMatchObject({ id: "shot-20", imageUrls: ["/api/media-assets/20"] });
    });

    it("keeps a video-only shot reviewable and preserves its media type", () => {
        const result = normalizeDramaVisualReviewInput({
            project: { title: "video project", ratio: "16:9" },
            episode: { title: "episode one", shots: [{ id: "video-shot", title: "motion", videoUrl: "https://cdn.example.com/shot.mp4" }] },
        });

        expect(result.tasks).toEqual([expect.objectContaining({ id: "video-shot", type: "video", videoUrls: ["https://cdn.example.com/shot.mp4"] })]);
        expect(result.tasks[0]).not.toHaveProperty("imageUrls");
    });

    it("keeps both storyboard images and video when a shot has both", () => {
        const result = normalizeDramaVisualReviewInput({
            project: { title: "video project" },
            episode: {
                title: "episode one",
                shots: [{ id: "mixed-shot", storyboardImageUrl: "/api/media-assets/frame.png", videoUrl: "https://cdn.example.com/shot.mp4" }],
            },
        });

        expect(result.tasks[0]).toMatchObject({ type: "video", imageUrls: ["/api/media-assets/frame.png"], videoUrls: ["https://cdn.example.com/shot.mp4"] });
    });

    it("drops invalid video URLs", () => {
        const result = normalizeDramaVisualReviewInput({
            project: { title: "video project" },
            episode: { shots: [{ id: "invalid-shot", videoUrl: "blob:expired" }] },
        });

        expect(result.tasks).toHaveLength(0);
    });
});
