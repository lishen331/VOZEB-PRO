import { describe, expect, it } from "vitest";

import { buildPublicWorkProcessSnapshot, parsePublicWorkProcessSnapshot } from "./public-work-process-snapshot";

const publishedAssets = [
    {
        id: "asset-image",
        versionId: "version-one",
        storageKey: "users/owner/storyboard.png",
        mediaType: "image" as const,
        mimeType: "image/png",
        role: "content" as const,
        sortOrder: 0,
        metadata: { originalName: "分镜.png" },
        createdAt: "2026-08-18T00:00:00.000Z",
    },
    {
        id: "asset-video",
        versionId: "version-one",
        storageKey: "users/owner/final.mp4",
        mediaType: "video" as const,
        mimeType: "video/mp4",
        role: "content" as const,
        sortOrder: 1,
        metadata: { originalName: "成片.mp4" },
        createdAt: "2026-08-18T00:00:00.000Z",
    },
];

describe("public work process snapshot", () => {
    it("projects a canvas into public structure and published asset ids only", () => {
        const snapshot = buildPublicWorkProcessSnapshot({
            sourceType: "canvas",
            versionId: "version-one",
            source: {
                id: "canvas-private",
                title: "公开画布",
                nodes: [
                    {
                        id: "node-one",
                        type: "image",
                        title: "第一张分镜",
                        position: { x: 12, y: 34 },
                        metadata: {
                            content: "雨夜中的车站",
                            prompt: "private execution prompt",
                            storageKey: "users/owner/storyboard.png",
                            imageTask: { id: "task-private", model: "private-model" },
                            apiKey: "secret-key",
                        },
                    },
                ],
                connections: [{ id: "connection-one", fromNodeId: "node-one", toNodeId: "missing-node" }],
                chatSessions: [{ messages: [{ text: "private chat" }] }],
            },
            assets: publishedAssets,
        });

        expect(snapshot).toEqual({
            sourceType: "canvas",
            versionId: "version-one",
            title: "公开画布",
            nodes: [
                {
                    id: "node-one",
                    type: "image",
                    title: "第一张分镜",
                    summary: "雨夜中的车站",
                    position: { x: 12, y: 34 },
                    assetIds: ["asset-image"],
                },
            ],
            connections: [],
            assets: [
                { id: "asset-image", title: "分镜.png", type: "image" },
                { id: "asset-video", title: "成片.mp4", type: "video" },
            ],
        });
        expect(JSON.stringify(snapshot)).not.toMatch(/private|secret-key|storageKey|task-private|users\/owner/);
    });

    it("projects drama stages without prompts, task ids, storage keys or private source assets", () => {
        const snapshot = buildPublicWorkProcessSnapshot({
            sourceType: "drama",
            versionId: "version-one",
            source: {
                id: "drama-private",
                title: "雨夜追踪",
                summary: "一场雨夜追踪",
                style: "电影感",
                ratio: "16:9",
                characters: [{ id: "character-one", name: "林夏", description: "调查员", referenceStorageKey: "users/owner/storyboard.png", voiceProfile: { instructions: "private voice prompt" } }],
                scenes: [{ id: "scene-one", name: "旧车站", description: "雨中的站台" }],
                sourceAssets: [{ id: "source-private", textContent: "private source material", storageKey: "users/owner/storyboard.png" }],
                episodes: [
                    {
                        id: "episode-one",
                        title: "第 1 集",
                        script: "林夏进入雨中的旧车站。",
                        reviewStatus: "approved",
                        shots: [
                            {
                                id: "shot-one",
                                order: 1,
                                title: "进入车站",
                                description: "林夏推门进入",
                                sceneId: "scene-one",
                                imagePrompt: "private image prompt",
                                videoPrompt: "private video prompt",
                                storyboardTaskId: "task-image-private",
                                generationTaskId: "task-video-private",
                                storyboardImageUrl: "/api/generation-log-assets/users/owner/storyboard.png",
                                videoUrl: "/api/generation-log-assets/users/owner/final.mp4",
                            },
                        ],
                    },
                ],
            },
            assets: publishedAssets,
        });

        expect(snapshot).toMatchObject({
            sourceType: "drama",
            versionId: "version-one",
            title: "雨夜追踪",
            summary: "一场雨夜追踪",
            style: "电影感",
            ratio: "16:9",
            characters: [{ id: "character-one", name: "林夏", summary: "调查员", assetIds: ["asset-image"] }],
            scenes: [{ id: "scene-one", title: "旧车站", summary: "雨中的站台" }],
            episodes: [
                {
                    id: "episode-one",
                    title: "第 1 集",
                    order: 1,
                    scriptSummary: "林夏进入雨中的旧车站。",
                    reviewStatus: "approved",
                    shots: [
                        {
                            id: "shot-one",
                            order: 1,
                            title: "进入车站",
                            summary: "林夏推门进入",
                            sceneId: "scene-one",
                            storyboardAssetIds: ["asset-image"],
                            videoAssetIds: ["asset-video"],
                        },
                    ],
                },
            ],
        });
        expect(JSON.stringify(snapshot)).not.toMatch(/private|storageKey|task-image|task-video|source material|imagePrompt|videoPrompt/);
    });

    it("rejects media sources and snapshots with unknown fields after a JSON round trip", () => {
        expect(() => buildPublicWorkProcessSnapshot({ sourceType: "media" as never, versionId: "version-one", source: {}, assets: [] })).toThrow("只支持 Canvas 或短剧作品");

        const parsed = parsePublicWorkProcessSnapshot(
            JSON.parse(
                JSON.stringify({
                    sourceType: "canvas",
                    versionId: "version-one",
                    title: "画布",
                    nodes: [],
                    connections: [],
                    assets: [],
                    prompt: "must-not-survive",
                }),
            ),
        );
        expect(parsed).toMatchObject({ sourceType: "canvas", versionId: "version-one" });
        expect(JSON.stringify(parsed)).not.toContain("must-not-survive");
    });
});
