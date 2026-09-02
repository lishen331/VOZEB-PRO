import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    updateDramaProject: vi.fn(),
}));

vi.mock("@/lib/server/drama-project-store", async () => {
    class DramaProjectStoreError extends Error {
        constructor(message: string, readonly status: number) {
            super(message);
        }
    }
    return { DramaProjectStoreError, updateDramaProject: mocks.updateDramaProject };
});

import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { DramaProjectStoreError } from "@/lib/server/drama-project-store";
import { DramaLabAudioSplitError, applyDramaAudioSplitDetailed, audioSplitCandidateId, dramaAudioSplitSourceFingerprint, planDramaAudioSplit, validateDramaAudioSplitPlan } from "./drama-lab-audio-split-service";

const shot = (overrides: Partial<DramaShot> = {}): DramaShot => ({
    id: "shot-source",
    order: 1,
    title: "门口争执",
    description: "两人站在门口",
    sourceText: "甲与乙争执",
    shotBoundary: "对白结束后切镜",
    dialogue: "",
    narration: "",
    utterances: [
        { id: "u-a", order: 1, type: "dialogue", speaker: "甲", text: "你来了。" },
        { id: "u-b", order: 2, type: "dialogue", speaker: "乙", text: "我来了。" },
    ],
    imagePrompt: "门口中景",
    videoPrompt: "两人对话",
    cameraMotion: "固定",
    duration: 8,
    characterIds: ["character-a", "character-b"],
    propIds: ["prop-door"],
    clueIds: [],
    sceneId: "scene-door",
    storyboardStatus: "success",
    generationStatus: "success",
    ...overrides,
});

const project = (source: DramaShot = shot()): DramaProject => ({
    id: "project-one",
    title: "测试短剧",
    summary: "",
    style: "写实",
    ratio: "9:16",
    status: "active",
    defaultVideoMode: "storyboard",
    characters: [],
    scenes: [],
    props: [],
    clues: [],
    episodes: [{ id: "episode-one", title: "第一集", script: "", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots: [source] }],
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
});

describe("drama lab audio split service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.updateDramaProject.mockImplementation(async (_userId: string, next: DramaProject) => next);
    });

    it("keeps persisted utterance order and uses measured rhythm durations", () => {
        const result = planDramaAudioSplit(shot({ narration: "夜色降临。" }), {
            cues: [
                { utteranceId: "u-a", durationMs: 1_800 },
                { utteranceId: "u-b", durationMs: 2_400 },
                { index: 2, durationMs: 3_100, startMs: 4_200, endMs: 7_300 },
            ],
        });

        expect(result.segments.map((segment) => [segment.kind, segment.speaker, segment.text])).toEqual([
            ["dialogue", "甲", "你来了。"],
            ["dialogue", "乙", "我来了。"],
            ["narration", undefined, "夜色降临。"],
        ]);
        expect(result.segments.map((segment) => segment.durationMs)).toEqual([1_800, 2_400, 3_100]);
        expect(result.segments.map((segment) => segment.durationSource)).toEqual(["audio", "audio", "rhythm"]);
        expect(result.segments.map((segment) => segment.candidateId)).toEqual([
            audioSplitCandidateId("shot-source", 0),
            audioSplitCandidateId("shot-source", 1),
            audioSplitCandidateId("shot-source", 2),
        ]);
    });

    it("derives duration from rhythm boundaries when a cue has no explicit duration", () => {
        const result = planDramaAudioSplit(shot(), {
            cues: [
                { utteranceId: "u-a", startMs: 1_200, endMs: 3_700 },
                { utteranceId: "u-b", startMs: 3_700, endMs: 5_100 },
            ],
        });

        expect(result.segments.map((segment) => segment.durationMs)).toEqual([2_500, 1_400]);
        expect(result.segments.map((segment) => segment.durationSource)).toEqual(["rhythm", "rhythm"]);
    });

    it("parses legacy labelled dialogue, preserves complete text, and estimates duration", () => {
        const legacy = shot({
            utterances: [],
            dialogue: "甲：第一句台词。\n乙：第二句台词。",
            narration: "画外音说明。",
        });
        const result = planDramaAudioSplit(legacy);

        expect(result.segments.map((segment) => segment.text)).toEqual(["第一句台词。", "第二句台词。", "画外音说明。"]);
        expect(result.segments.map((segment) => segment.speaker)).toEqual(["甲", "乙", undefined]);
        expect(result.segments.every((segment) => segment.duration >= 1 && segment.duration <= 120)).toBe(true);
        expect(result.segments.map((segment) => segment.utterances[0].id)).toEqual([
            "utterance-shot-source-dialogue-1",
            "utterance-shot-source-dialogue-2",
            "utterance-shot-source-narration-1",
        ]);
    });

    it("rejects no-op and narration-only splits", () => {
        expect(() => planDramaAudioSplit(shot({ utterances: [{ id: "u1", order: 1, type: "dialogue", speaker: "甲", text: "一句话" }] }))).toThrowError(new DramaLabAudioSplitError("当前镜头只有一段对白或旁白，无需按音频拆镜", 409));
        expect(() => planDramaAudioSplit(shot({ utterances: [{ id: "v1", order: 1, type: "voiceover", speaker: "", text: "第一段" }, { id: "v2", order: 2, type: "voiceover", speaker: "", text: "第二段" }], dialogue: "", narration: "" }))).toThrowError("仅有旁白时无法按对白拆镜");
    });

    it("rejects a stale or tampered preview before persistence", () => {
        const source = shot();
        const preview = planDramaAudioSplit(source);
        expect(() => validateDramaAudioSplitPlan({ ...source, dialogue: "已被编辑" }, preview)).toThrowError("当前镜头内容已变化");
        const tampered = { ...preview, segments: preview.segments.map((segment, index) => index === 0 ? { ...segment, text: "伪造台词" } : segment) };
        expect(() => validateDramaAudioSplitPlan(source, tampered)).toThrowError("文本已变化");
        expect(dramaAudioSplitSourceFingerprint(source)).toBe(preview.sourceFingerprint);
    });

    it("rejects client durations outside the declared clip bounds", () => {
        const source = shot();
        const preview = planDramaAudioSplit(source);
        const tampered = {
            ...preview,
            segments: preview.segments.map((segment) => ({ ...segment, durationMs: 121_000 })),
        };
        expect(() => validateDramaAudioSplitPlan(source, tampered)).toThrowError("超出允许范围");
    });

    it("does not allow an explicitly manual shot to enter the automatic split path", () => {
        const manual = shot({ origin: "manual" } as Partial<DramaShot> & { origin: string });
        expect(() => planDramaAudioSplit(manual)).toThrowError("手工创建的镜头");
    });

    it("appends candidates and leaves neighbouring manual shots byte-for-byte unchanged", async () => {
        const manual = shot({ id: "shot-manual", order: 2, title: "手工镜头", dialogue: "手工内容", utterances: [{ id: "manual-u", order: 1, type: "dialogue", speaker: "丙", text: "手工内容" }] });
        const current = project(shot());
        current.episodes[0].shots.push(manual);
        const manualSnapshot = JSON.stringify(manual);
        const preview = planDramaAudioSplit(current.episodes[0].shots[0], { totalDurationMs: 4_000 });
        const result = await applyDramaAudioSplitDetailed({ userId: "user-one", project: current, episodeId: "episode-one", shotId: "shot-source", plan: preview });
        const savedShots = result.project.episodes[0].shots;

        expect(result.createdShots).toHaveLength(2);
        expect(savedShots.slice(0, 2).map((item) => item.id)).toEqual(["shot-source", "shot-manual"]);
        expect(JSON.stringify(savedShots[1])).toBe(manualSnapshot);
        expect(savedShots.slice(2).map((item) => item.audioSplitSourceShotId)).toEqual(["shot-source", "shot-source"]);
        expect(savedShots.slice(2).map((item) => item.order)).toEqual([3, 4]);
        expect(savedShots.slice(2).every((item) => item.sceneId === "scene-door" && item.characterIds.join(",") === "character-a,character-b")).toBe(true);
        expect(savedShots.slice(2).every((item) => item.videoPrompt.includes("仅") && item.videoPrompt.includes("闭口"))).toBe(true);
    });

    it("does not carry source-derived frame prompts or media into candidates", async () => {
        const source = shot({
            startFramePrompt: "源镜头起始动作",
            endFramePrompt: "源镜头结束动作",
            negativePrompt: "保持角色身份",
            storyboardEndStatus: "success",
            storyboardEndTaskId: "old-end-task",
            storyboardEndImageUrl: "/old-end.png",
            storyboardEndImageWidth: 1280,
            storyboardEndImageHeight: 720,
            storyboardImageUrl: "/old-start.png",
            storyboardImageWidth: 1280,
            storyboardImageHeight: 720,
            videoUrl: "/old-video.mp4",
        });
        const preview = planDramaAudioSplit(source);
        const result = await applyDramaAudioSplitDetailed({ userId: "user-one", project: project(source), episodeId: "episode-one", shotId: source.id, plan: preview });
        const candidate = result.createdShots[0];

        expect(candidate).toMatchObject({ negativePrompt: "保持角色身份", audioMode: "source" });
        expect(candidate.startFramePrompt).toBeUndefined();
        expect(candidate.endFramePrompt).toBeUndefined();
        expect(candidate.storyboardImageUrl).toBeUndefined();
        expect(candidate.storyboardEndImageUrl).toBeUndefined();
        expect(candidate.storyboardEndTaskId).toBeUndefined();
        expect(candidate.videoUrl).toBeUndefined();
    });

    it("is idempotent and does not overwrite an edited candidate", async () => {
        const source = shot();
        const preview = planDramaAudioSplit(source);
        const first = await applyDramaAudioSplitDetailed({ userId: "user-one", project: project(source), episodeId: "episode-one", shotId: "shot-source", plan: preview });
        const editedCandidate = { ...first.project.episodes[0].shots[1], title: "用户已编辑的候选" };
        const secondProject = { ...first.project, episodes: [{ ...first.project.episodes[0], shots: [first.project.episodes[0].shots[0], editedCandidate, first.project.episodes[0].shots[2]] }] };
        const second = await applyDramaAudioSplitDetailed({ userId: "user-one", project: secondProject, episodeId: "episode-one", shotId: "shot-source", plan: preview });

        expect(second.createdShots).toHaveLength(0);
        expect(second.skippedSegmentIndexes).toEqual([0, 1]);
        expect(second.project.episodes[0].shots[1].title).toBe("用户已编辑的候选");
        expect(mocks.updateDramaProject).toHaveBeenCalledTimes(1);
    });

    it("surfaces optimistic version conflicts instead of replaying over newer manual edits", async () => {
        mocks.updateDramaProject.mockRejectedValueOnce(new DramaProjectStoreError("项目已更新", 409));
        const preview = planDramaAudioSplit(shot());
        await expect(applyDramaAudioSplitDetailed({ userId: "user-one", project: project(), episodeId: "episode-one", shotId: "shot-source", plan: preview })).rejects.toMatchObject({ status: 409 });
    });
});
