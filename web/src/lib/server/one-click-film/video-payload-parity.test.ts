import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/drama-lab-prompt-template-service", () => ({
    resolveDramaLabPrompt: vi.fn().mockResolvedValue({ key: "key_frame_prompt", template: "KEY FRAME TEMPLATE" }),
    withDramaLabPromptContract: (template: string, contract: string) => `${template}\n${contract}`,
}));
vi.mock("@/lib/server/drama-project-store", () => {
    class DramaProjectStoreError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    }
    return { DramaProjectStoreError, getDramaProject: vi.fn(), updateDramaProject: vi.fn() };
});

import { prepareDramaLabStoryboardVideo, updateDramaLabShot } from "@/lib/server/drama-lab-shot-generation-service";
import type { DramaProject } from "@/lib/drama-project-contract";

const reference = (id: string, url: string) => [{ id, url, source: "upload" as const, label: id, createdAt: "2026-09-01T00:00:00.000Z" }];

/**
 * 一键成片与创作工坊共用同一套上游请求构造，这里锁死"最终发送给上游的帧顺序"，
 * 一旦有人给一键成片单独改链路、导致首帧/尾帧/参考图顺序偏离 L，这个测试必须先红。
 */
const project = {
    id: "one-click-project",
    title: "一键成片",
    summary: "",
    style: "写实",
    ratio: "9:16",
    status: "active",
    sourceHandoffId: "one-click-film:abc",
    creativeConversationId: "conversation-one",
    characters: [{ id: "character-a", name: "角色A", description: "", references: reference("character-ref", "/api/reference-assets/character.png"), primaryReferenceId: "character-ref" }],
    scenes: [{ id: "scene-a", name: "场景A", description: "", references: reference("scene-ref", "/api/reference-assets/scene.png"), primaryReferenceId: "scene-ref" }],
    props: [{ id: "prop-a", name: "道具A", description: "", references: reference("prop-ref", "/api/reference-assets/prop.png"), primaryReferenceId: "prop-ref" }],
    clues: [],
    defaultVideoMode: "storyboard",
    episodes: [
        {
            id: "episode-one",
            title: "第一集",
            episodeNumber: 1,
            script: "剧本",
            outline: "",
            hook: "",
            nextPreview: "",
            sourceRange: "",
            reviewStatus: "draft",
            shots: [
                {
                    id: "shot-one",
                    order: 1,
                    title: "镜头一",
                    description: "描述",
                    sourceText: "原文",
                    shotBoundary: "",
                    dialogue: "",
                    narration: "",
                    utterances: [],
                    imagePrompt: "",
                    videoPrompt: "缓慢推进",
                    cameraMotion: "",
                    duration: 3,
                    characterIds: ["character-a"],
                    propIds: ["prop-a"],
                    clueIds: [],
                    sceneId: "scene-a",
                },
            ],
        },
    ],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
} as unknown as DramaProject;

const withFrames = () =>
    updateDramaLabShot(project, "episode-one", "shot-one", {
        storyboardFrameMode: "first_last",
        frames: {
            first: { prompt: "起始", status: "success", url: "/api/generation-log-assets/first.png", taskId: "first-task" },
            key: { prompt: "关键", status: "success", url: "/api/generation-log-assets/key.png", taskId: "key-task", width: 720, height: 1280 },
            last: { prompt: "结束", status: "success", url: "/api/generation-log-assets/last.png", taskId: "last-task" },
        },
    });

describe("one-click-film video payload parity with L", () => {
    it("orders first_frame, last_frame, then the key-frame reference", () => {
        const prepared = prepareDramaLabStoryboardVideo(withFrames(), "episode-one", "shot-one", { supportsFirstFrame: true, supportsLastFrame: true });
        expect(prepared.references.map((item) => item.role)).toEqual(["first_frame", "last_frame", "reference"]);
        expect(prepared.references.map((item) => item.url)).toEqual(["/api/generation-log-assets/first.png", "/api/generation-log-assets/last.png", "/api/generation-log-assets/key.png"]);
    });

    it("drops the last frame when the channel cannot accept one, and records why", () => {
        const prepared = prepareDramaLabStoryboardVideo(withFrames(), "episode-one", "shot-one", { supportsFirstFrame: true, supportsLastFrame: false });
        expect(prepared.references.map((item) => item.role)).toEqual(["first_frame", "reference"]);
        expect(prepared.frameSnapshot.fallbackReason).toContain("尾帧");
    });

    it("falls back to a plain reference when the channel has no explicit first-frame input", () => {
        const prepared = prepareDramaLabStoryboardVideo(withFrames(), "episode-one", "shot-one", { supportsFirstFrame: false });
        expect(prepared.references.map((item) => item.role)).toEqual(["reference"]);
        expect(prepared.frameSnapshot.fallbackReason).toContain("首帧");
    });

    it("keeps universal mode references in scene, character, prop slot order", () => {
        const universal = updateDramaLabShot(project, "episode-one", "shot-one", {
            creationMode: "universal",
            universalSegmentText: "画面风格和类型: 写实\n生成一个由以下1个分镜组成的视频。\n环境参考 @图片1。\n分镜1： 3秒: @图片2 拿起 @图片3。",
        });
        const prepared = prepareDramaLabStoryboardVideo(universal, "episode-one", "shot-one", { supportsReferenceImages: true });
        expect(prepared.references.map((item) => item.url)).toEqual(["/api/reference-assets/scene.png", "/api/reference-assets/character.png", "/api/reference-assets/prop.png"]);
        expect(prepared.references.every((item) => item.role === "reference")).toBe(true);
    });

    it("refuses universal mode on a channel that has not confirmed reference-image support", () => {
        const universal = updateDramaLabShot(project, "episode-one", "shot-one", { creationMode: "universal", universalSegmentText: "画面风格和类型: 写实\n分镜1： 3秒: 测试。" });
        expect(() => prepareDramaLabStoryboardVideo(universal, "episode-one", "shot-one", {})).toThrow("参考图");
    });
});
