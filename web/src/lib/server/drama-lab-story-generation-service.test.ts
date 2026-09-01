import { describe, expect, it } from "vitest";

import { normalizeEpisodeCount, parseStoryEpisodes, storyEpisodeSequenceError, storyTaskView } from "./drama-lab-story-generation-service";

describe("Drama Lab story task helpers", () => {
    it("normalizes requested episode count to a bounded positive integer", () => {
        expect(normalizeEpisodeCount("3")).toBe(3);
        expect(normalizeEpisodeCount("0")).toBe(1);
        expect(normalizeEpisodeCount("not-a-number")).toBe(1);
        expect(normalizeEpisodeCount(999)).toBe(100);
    });

    it("accepts direct arrays and object-wrapped episode results", () => {
        expect(parseStoryEpisodes(JSON.stringify([{ episode: 1, title: "一", content: "内容一" }, { episode: 2, title: "二", script: "内容二" }]), 2)).toEqual([
            { episode: 1, title: "一", content: "内容一" },
            { episode: 2, title: "二", content: "内容二" },
        ]);
        expect(parseStoryEpisodes('```json\n{"episodes":[{"episode":2,"title":"二","text":"内容二"},{"episode":1,"content":"内容一"}]}\n```', 2)).toEqual([
            { episode: 1, title: "第 1 集", content: "内容一" },
            { episode: 2, title: "二", content: "内容二" },
        ]);
    });

    it("keeps a plain text fallback recoverable as one episode", () => {
        expect(parseStoryEpisodes("第一幕\n人物进入房间", 1)).toEqual([{ episode: 1, title: "第 1 集", content: "第一幕\n人物进入房间" }]);
    });

    it("rejects incomplete or non-contiguous multi-episode results explicitly", () => {
        expect(storyEpisodeSequenceError([{ episode: 1, content: "第一集" }], 3)).toBe("文本模型返回了 1 集，但请求生成 3 集");
        expect(storyEpisodeSequenceError([{ episode: 1, content: "第一集" }, { episode: 3, content: "第三集" }], 2)).toBe("文本模型返回的分集编号不连续，应为第 2 集，实际为第 3 集");
        expect(storyEpisodeSequenceError([{ episode: 1, content: "第一集" }, { episode: 3, content: "第三集" }, { episode: 2, content: "第二集" }], 3)).toBe("文本模型返回的分集编号不连续，应为第 2 集，实际为第 3 集");
        expect(storyEpisodeSequenceError([{ episode: 1, content: "第一集" }, { episode: 2, content: "第二集" }, { episode: 3, content: "第三集" }], 3)).toBeUndefined();
    });

    it("reports durable batch progress instead of exposing task internals", () => {
        const view = storyTaskView({
            id: "text-story",
            userId: "user-one",
            status: "success",
            createdAt: 1,
            updatedAt: 2,
            config: { baseUrl: "/api/ai/system/writer", apiKey: "", apiFormat: "openai", model: "writer" },
            messages: [],
            storyBatch: {
                version: 1,
                projectId: "project-one",
                sourceEpisodeId: "episode-one",
                sourceEpisodeIndex: 0,
                targetEpisodeIds: ["episode-one", "episode-two"],
                episodeCount: 2,
                storyOutline: "outline",
                storyStyle: "现代",
                scriptType: "短剧",
                status: "persisting",
                persistedEpisodeIndexes: [0],
                startedAt: 1,
            },
        });
        expect(view).toEqual({ id: "text-story", status: "running", phase: "persisting", progress: 50, episodeCount: 2, persistedEpisodeCount: 1 });
    });
});
