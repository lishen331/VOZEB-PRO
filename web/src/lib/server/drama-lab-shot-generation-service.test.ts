import { describe, expect, it, vi } from "vitest";

const storeMocks = vi.hoisted(() => ({
    getDramaProject: vi.fn(),
    updateDramaProject: vi.fn(),
}));

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
    return { DramaProjectStoreError, getDramaProject: storeMocks.getDramaProject, updateDramaProject: storeMocks.updateDramaProject };
});

import { DramaProjectStoreError } from "@/lib/server/drama-project-store";
import { DramaLabShotGenerationError, appendDramaLabGenerationHistory, persistDramaLabShotUpdate, prepareDramaLabStoryboardImage, prepareDramaLabStoryboardVideo, updateDramaLabShot } from "./drama-lab-shot-generation-service";
import { buildDramaLabFrameReferences, previousDramaLabShot } from "./drama-lab-frame-generation-service";

const project = {
    id: "project-one",
    title: "雨夜来电",
    summary: "",
    style: "现代悬疑",
    ratio: "9:16",
    status: "active" as const,
    creativeConversationId: "conversation-one",
    characters: [
        {
            id: "character-lin",
            name: "林薇",
            description: "红色风衣",
            references: [{ id: "character-ref", url: "/api/reference-assets/character.png", source: "upload" as const, label: "林薇主图", createdAt: "2026-08-22T00:00:00.000Z" }],
            primaryReferenceId: "character-ref",
        },
    ],
    scenes: [
        {
            id: "scene-station",
            name: "雨夜车站",
            description: "潮湿站台",
            references: [{ id: "scene-ref", url: "/api/reference-assets/scene.png", source: "upload" as const, label: "车站主图", createdAt: "2026-08-22T00:00:00.000Z" }],
            primaryReferenceId: "scene-ref",
        },
    ],
    props: [
        {
            id: "prop-phone",
            name: "裂屏手机",
            description: "关键道具",
            references: [{ id: "prop-ref", url: "/api/reference-assets/phone.png", source: "upload" as const, label: "手机主图", createdAt: "2026-08-22T00:00:00.000Z" }],
            primaryReferenceId: "prop-ref",
        },
    ],
    clues: [],
    defaultVideoMode: "storyboard" as const,
    episodes: [
        {
            id: "episode-one",
            title: "第一集",
            script: "林薇在雨夜车站接起电话。",
            outline: "",
            hook: "",
            nextPreview: "",
            sourceRange: "",
            reviewStatus: "draft" as const,
            shots: [
                {
                    id: "shot-one",
                    order: 1,
                    title: "雨夜来电",
                    description: "林薇在雨夜车站接起裂屏手机。",
                    sourceText: "林薇在雨夜车站接起电话。",
                    shotBoundary: "来电响起至林薇接听。",
                    dialogue: "林薇：喂？",
                    narration: "",
                    utterances: [],
                    imagePrompt: "中景，雨水映出霓虹",
                    videoPrompt: "镜头缓慢推进，林薇接起手机",
                    cameraMotion: "缓慢推进",
                    duration: 3,
                    characterIds: ["character-lin"],
                    propIds: ["prop-phone"],
                    clueIds: [],
                    sceneId: "scene-station",
                },
            ],
        },
    ],
    createdAt: "2026-08-22T00:00:00.000Z",
    updatedAt: "2026-08-22T00:00:00.000Z",
};

describe("drama lab shot generation service", () => {
    it("uses universal text with scene, character, prop references without requiring a storyboard image", () => {
        const universalSegmentText = "画面风格和类型: 写实\n生成一个由以下1个分镜组成的视频。\n环境参考 @图片1。\n分镜1： 3秒: 缓推 @图片2 手中的 @图片3，横移后拉回。";
        const value = { ...project, episodes: project.episodes.map((episode) => ({ ...episode, shots: episode.shots.map((shot) => ({ ...shot, creationMode: "universal" as const, universalSegmentText })) })) };
        const result = prepareDramaLabStoryboardVideo(value, "episode-one", "shot-one", { supportsReferenceImages: true, maxReferenceImages: 3 });
        expect(result.visiblePrompt).toBe(universalSegmentText);
        expect(result.references.map((ref) => ref.url)).toEqual(["/api/reference-assets/scene.png", "/api/reference-assets/character.png", "/api/reference-assets/phone.png"]);
        expect(result.references.every((ref) => ref.role === "reference")).toBe(true);
        expect(result.prompt).not.toContain("动态要求：镜头缓慢推进，林薇接起手机");
        expect(() => prepareDramaLabStoryboardVideo(value, "episode-one", "shot-one", { supportsReferenceImages: true, maxReferenceImages: 2 })).toThrow("参考图");
        expect(() => prepareDramaLabStoryboardVideo(value, "episode-one", "shot-one", { supportsReferenceImages: false })).toThrow("参考图");
    });

    it("appends the optional storyboard without replacing numbered asset slots", () => {
        const value = updateDramaLabShot(project, "episode-one", "shot-one", {
            creationMode: "universal",
            storyboardImageUrl: "/storyboard.png",
            universalSegmentText: "画面风格和类型: 写实\n生成一个由以下1个分镜组成的视频。\n环境参考 @图片1。\n分镜1： 3秒: 缓推 @图片2 手中的 @图片3，构图参考 @图片4。",
        });
        const result = prepareDramaLabStoryboardVideo(value, "episode-one", "shot-one", { supportsReferenceImages: true });
        expect(result.references.map((ref) => ref.url)).toEqual(["/api/reference-assets/scene.png", "/api/reference-assets/character.png", "/api/reference-assets/phone.png", "/storyboard.png"]);
        expect(result.frameSnapshot.references.map((ref) => ref.url)).toEqual(result.references.map((ref) => ref.url));
        expect(result.prompt).toContain("@图片4：当前分镜图");
        const missing = { ...value, props: value.props.map((prop) => ({ ...prop, references: [] })) };
        expect(() => prepareDramaLabStoryboardVideo(missing, "episode-one", "shot-one", { supportsReferenceImages: true })).toThrow();
    });

    it("expands style presets in prepared image and video prompts without changing references", async () => {
        const styled = { ...project, style: "cinematic" };
        const image = await prepareDramaLabStoryboardImage(styled, "episode-one", "shot-one");
        expect(image.prompt).toContain("anamorphic lens");
        expect(image.prompt).toContain("伦勃朗式戏剧性布光");
        const videoProject = { ...styled, episodes: styled.episodes.map((episode) => ({ ...episode, shots: episode.shots.map((shot) => ({ ...shot, storyboardImageUrl: "/reference.png" })) })) };
        expect(prepareDramaLabStoryboardVideo(videoProject, "episode-one", "shot-one").prompt).toContain("anamorphic lens");
        expect(styled.style).toBe("cinematic");
        expect(image.references.map((item) => item.id)).toEqual(["scene-ref", "character-ref", "prop-ref"]);
    });

    it("uses the editable frame template with the project's real bound asset references", async () => {
        const prepared = await prepareDramaLabStoryboardImage(project, "episode-one", "shot-one");

        expect(prepared.templateKey).toBe("key_frame_prompt");
        expect(prepared.prompt).toContain("KEY FRAME TEMPLATE");
        expect(prepared.prompt).toContain("场景白名单：scene-station / 雨夜车站");
        expect(prepared.prompt).toContain("角色白名单：character-lin / 林薇");
        expect(prepared.prompt).toContain("道具白名单：prop-phone / 裂屏手机");
        expect(prepared.references.map((item) => item.id)).toEqual(["scene-ref", "character-ref", "prop-ref"]);
    });

    it("rejects visual generation when a bound asset has no primary reference image", async () => {
        const projectWithoutSceneReference = {
            ...project,
            scenes: [{ ...project.scenes[0], references: [], primaryReferenceId: undefined, referenceImageUrl: undefined }],
        };

        await expect(prepareDramaLabStoryboardImage(projectWithoutSceneReference, "episode-one", "shot-one")).rejects.toThrow("当前分镜绑定的资产缺少主参考图：场景「雨夜车站」");
    });

    it("requires a current visual frame and passes it before the asset references to video generation", () => {
        expect(() => prepareDramaLabStoryboardVideo(project, "episode-one", "shot-one")).toThrow(new DramaLabShotGenerationError("请先生成当前镜头的关键帧或分镜图"));
        const withStoryboard = updateDramaLabShot(project, "episode-one", "shot-one", { storyboardImageUrl: "/api/generation-log-assets/storyboard.png", storyboardImageWidth: 720, storyboardImageHeight: 1280 });

        const prepared = prepareDramaLabStoryboardVideo(withStoryboard, "episode-one", "shot-one");
        expect(prepared.references.map((item) => item.id)).toEqual(["storyboard-shot-one"]);
        expect(prepared.prompt).toContain("仅使用当前镜头绑定的场景、角色和道具");
    });

    it("uses a completed key frame as the video source without requiring a legacy storyboard image", () => {
        const withKeyFrame = updateDramaLabShot(project, "episode-one", "shot-one", {
            frames: {
                first: { prompt: "起始状态", status: "success", url: "/api/generation-log-assets/first.png", taskId: "first-task" },
                key: { prompt: "关键状态", status: "success", url: "/api/generation-log-assets/key.png", taskId: "key-task", width: 720, height: 1280 },
                last: { prompt: "结束状态", status: "success", url: "/api/generation-log-assets/last.png", taskId: "last-task" },
            },
        });

        const prepared = prepareDramaLabStoryboardVideo(withKeyFrame, "episode-one", "shot-one", { supportsLastFrame: true });
        expect(prepared.parentTaskId).toBe("key-task");
        expect(prepared.references.map((item) => item.id)).toEqual(["first-frame-shot-one", "last-frame-shot-one", "key-frame-shot-one"]);
        expect(prepared.references.map((item) => item.role)).toEqual(["first_frame", "last_frame", "reference"]);
        expect(prepared.references.find((item) => item.role === "first_frame")).toMatchObject({
            frameType: "first",
            url: "/api/generation-log-assets/first.png",
            taskId: "first-task",
        });
        expect(prepared.references.find((item) => item.role === "last_frame")).toMatchObject({
            frameType: "last",
            url: "/api/generation-log-assets/last.png",
            taskId: "last-task",
        });
        expect(prepared.frameSnapshot).toMatchObject({
            supportsLastFrame: true,
            references: [
                { role: "first_frame", frameType: "first", url: "/api/generation-log-assets/first.png", taskId: "first-task" },
                { role: "last_frame", frameType: "last", url: "/api/generation-log-assets/last.png", taskId: "last-task" },
                { role: "reference", frameType: "key", url: "/api/generation-log-assets/key.png", taskId: "key-task" },
            ],
        });
    });

    it("does not silently turn an unsupported tail frame into a regular reference", () => {
        const withKeyFrame = updateDramaLabShot(project, "episode-one", "shot-one", {
            frames: {
                first: { prompt: "起始状态", status: "success", url: "/first.png", taskId: "first-task", source: "generated" },
                key: { prompt: "关键状态", status: "success", url: "/key.png", taskId: "key-task", source: "generated" },
                last: { prompt: "结束状态", status: "success", url: "/last.png", taskId: "last-task", source: "generated" },
            },
        });

        const prepared = prepareDramaLabStoryboardVideo(withKeyFrame, "episode-one", "shot-one", { model: "video-first-only", supportsLastFrame: false });
        expect(prepared.references.map((item) => item.role)).toEqual(["first_frame", "reference"]);
        expect(prepared.references.some((item) => item.url === "/last.png")).toBe(false);
        expect(prepared.frameSnapshot).toMatchObject({
            model: "video-first-only",
            supportsLastFrame: false,
            fallbackReason: expect.stringContaining("不支持尾帧"),
        });
    });

    it("defaults to a conservative first-frame-only request when capability is unknown", () => {
        const withKeyFrame = updateDramaLabShot(project, "episode-one", "shot-one", {
            frames: {
                first: { prompt: "起始状态", status: "success", url: "/first.png", taskId: "first-task" },
                key: { prompt: "关键状态", status: "success", url: "/key.png", taskId: "key-task" },
                last: { prompt: "结束状态", status: "success", url: "/last.png", taskId: "last-task" },
            },
        });

        const prepared = prepareDramaLabStoryboardVideo(withKeyFrame, "episode-one", "shot-one");
        expect(prepared.references.map((item) => item.role)).toEqual(["first_frame", "reference"]);
        expect(prepared.references.some((item) => item.url === "/last.png")).toBe(false);
        expect(prepared.frameSnapshot.supportsLastFrame).toBe(false);
    });

    it("clips references by provider capacity without changing frame roles", () => {
        const withKeyFrame = updateDramaLabShot(project, "episode-one", "shot-one", {
            frames: {
                first: { prompt: "起始状态", status: "success", url: "/first.png", taskId: "first-task" },
                key: { prompt: "关键状态", status: "success", url: "/key.png", taskId: "key-task" },
                last: { prompt: "结束状态", status: "success", url: "/last.png", taskId: "last-task" },
            },
        });

        const prepared = prepareDramaLabStoryboardVideo(withKeyFrame, "episode-one", "shot-one", { supportsLastFrame: true, maxReferenceImages: 2 });
        expect(prepared.references.map((item) => item.role)).toEqual(["first_frame", "last_frame"]);
        expect(prepared.references.some((item) => item.role === "reference")).toBe(false);
        expect(prepared.frameSnapshot).toMatchObject({ maxReferenceImages: 2, supportsLastFrame: true });
        expect(prepared.frameSnapshot.fallbackReason).toContain("省略普通关键帧参考图");
    });

    it("links the previous shot tail frame to the next shot first-frame plan", () => {
        const nextShot = {
            ...project.episodes[0].shots[0],
            id: "shot-two",
            order: 2,
            title: "回头",
            frames: undefined,
        };
        const previous = project.episodes[0].shots[0];
        const withTail = updateDramaLabShot(project, "episode-one", "shot-one", {
            frames: { last: { prompt: "人物停在站台右侧", status: "success", url: "/tail.png", taskId: "tail-task" } },
        });
        const episodeShots = [withTail.episodes[0].shots[0], nextShot];
        expect(previousDramaLabShot(episodeShots, nextShot)?.id).toBe(previous.id);
        expect(buildDramaLabFrameReferences(withTail, nextShot, "first", episodeShots[0]).map((item) => item.id)).toEqual(["previous-last-frame-shot-one", "scene-ref", "character-ref", "prop-ref"]);
    });

    it("keeps historical media versions by task identity and updates only the selected shot", () => {
        const history = appendDramaLabGenerationHistory([{ id: "old", taskId: "task-old", url: "/old.png", prompt: "old", createdAt: "2026-08-22T00:00:00.000Z" }], {
            id: "new",
            taskId: "task-new",
            url: "/new.png",
            prompt: "new",
            createdAt: "2026-08-22T00:00:01.000Z",
        });
        expect(history.map((item) => item.taskId)).toEqual(["task-old", "task-new"]);
        expect(updateDramaLabShot(project, "episode-one", "shot-one", { storyboardHistory: history }).episodes[0]?.shots[0]?.storyboardHistory).toEqual(history);
    });

    it("reapplies task-owned fields to the latest project after one autosave conflict", async () => {
        const latest = { ...project, updatedAt: "2026-08-22T00:00:02.000Z" };
        storeMocks.updateDramaProject.mockReset();
        storeMocks.getDramaProject.mockReset();
        storeMocks.updateDramaProject.mockRejectedValueOnce(new DramaProjectStoreError("conflict", 409)).mockResolvedValueOnce(latest);
        storeMocks.getDramaProject.mockResolvedValue(latest);

        const updated = await persistDramaLabShotUpdate({
            userId: "user-one",
            project,
            episodeId: "episode-one",
            shotId: "shot-one",
            patch: { storyboardTaskId: "image-task", storyboardStatus: "running" },
        });

        expect(storeMocks.getDramaProject).toHaveBeenCalledWith("project-one", "user-one");
        expect(storeMocks.updateDramaProject).toHaveBeenLastCalledWith("user-one", expect.objectContaining({ updatedAt: expect.any(String) }), latest.updatedAt);
        expect(updated.episodes[0]?.shots[0]).toMatchObject({ storyboardTaskId: "image-task", storyboardStatus: "running" });
    });
});
