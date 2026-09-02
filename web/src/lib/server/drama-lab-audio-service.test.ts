import { describe, expect, it, vi } from "vitest";
import type { DramaProject } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({
    getAudioTask: vi.fn(),
    updateDramaProject: vi.fn(),
}));

vi.mock("@/lib/server/audio-task-store", () => ({ getAudioTask: mocks.getAudioTask }));
vi.mock("@/lib/server/drama-project-store", () => ({ updateDramaProject: mocks.updateDramaProject, DramaProjectStoreError: class DramaProjectStoreError extends Error { constructor(message: string, readonly status: number) { super(message); } } }));

import { DramaLabAudioError, assertAudioTaskBinding, assertAudioTaskContext, legacyDramaAudioKind, legacyDramaAudioTaskId, prepareDramaLabAudio, syncDramaLabAudioTask } from "./drama-lab-audio-service";

const project = {
    id: "project-one",
    title: "测试短剧",
    summary: "",
    style: "",
    ratio: "16:9",
    status: "active",
    defaultVideoMode: "storyboard",
    characters: [{ id: "character-one", name: "林夏", description: "", voiceProfile: { voice: "nova", speed: 1.2, instructions: "温柔" } }],
    scenes: [], props: [], clues: [],
    episodes: [{ id: "episode-one", title: "第一集", script: "", outline: "", hook: "", nextPreview: "", sourceRange: "", reviewStatus: "draft", shots: [{ id: "shot-one", order: 1, title: "门口", description: "", sourceText: "", shotBoundary: "", dialogue: "", narration: "风吹过。", utterances: [{ id: "u1", order: 1, type: "dialogue" as const, speaker: "林夏", text: "你好" }], imagePrompt: "", videoPrompt: "", cameraMotion: "", duration: 5, characterIds: ["character-one"], propIds: [], clueIds: [], audioMode: "voiceover", audioStatus: "running", audioTaskId: "task-one" }] }],
    createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
} as unknown as DramaProject;

describe("drama lab audio service", () => {
    it("infers legacy track ownership from text rather than the voiceover mode", () => {
        expect(legacyDramaAudioKind(project.episodes[0].shots[0])).toBe("dialogue");
        expect(legacyDramaAudioKind({
            ...project.episodes[0].shots[0],
            dialogue: "",
            narration: "夜色降临。",
            utterances: [],
            audioMode: "voiceover",
        })).toBe("narration");
        expect(legacyDramaAudioKind({
            ...project.episodes[0].shots[0],
            dialogue: "对白优先",
            narration: "同时存在的旁白",
        })).toBe("dialogue");
        expect(legacyDramaAudioTaskId(project.episodes[0].shots[0], "dialogue")).toBe("task-one");
        expect(legacyDramaAudioTaskId(project.episodes[0].shots[0], "narration")).toBeUndefined();
    });

    it("uses persisted utterances and character voice profile", () => {
        const input = prepareDramaLabAudio(project, "episode-one", "shot-one", "dialogue");
        expect(input.prompt).toBe("你好");
        expect(input.speaker).toBe("林夏");
        expect(input.voice).toBe("nova");
        expect(input.speed).toBe(1.2);
        expect(input.instructions).toBe("温柔");
    });

    it("falls back to narration text and rejects empty audio input", () => {
        expect(prepareDramaLabAudio(project, "episode-one", "shot-one", "narration").prompt).toBe("风吹过。");
        const utteranceOnly = {
            ...project,
            episodes: [{
                ...project.episodes[0],
                shots: [{ ...project.episodes[0].shots[0], narration: "", utterances: [{ id: "voice-1", order: 1, type: "voiceover" as const, speaker: "", text: "夜色降临。" }] }],
            }],
        };
        expect(prepareDramaLabAudio(utteranceOnly, "episode-one", "shot-one", "narration").prompt).toBe("夜色降临。");
        const empty = { ...project, episodes: [{ ...project.episodes[0], shots: [{ ...project.episodes[0].shots[0], narration: "", dialogue: "", subtitle: "", utterances: [] }] }] };
        expect(() => prepareDramaLabAudio(empty, "episode-one", "shot-one", "narration")).toThrow(DramaLabAudioError);
    });

    it("persists a playable result only for the matching task context", async () => {
        mocks.getAudioTask.mockResolvedValue({
            id: "task-one",
            userId: "user-one",
            surface: "drama",
            projectId: "project-one",
            episodeId: "episode-one",
            shotId: "shot-one",
            status: "success",
            config: { voice: "nova", speed: "1.25", instructions: "保持自然" },
            result: { url: "/api/reference-assets/audio.wav", mimeType: "audio/wav" },
        });
        mocks.updateDramaProject.mockImplementation(async (_user: string, next: unknown) => next);
        const updated = await syncDramaLabAudioTask({ userId: "user-one", project, episodeId: "episode-one", shotId: "shot-one", taskId: "task-one" });
        expect(updated.episodes[0].shots[0]).toMatchObject({
            audioStatus: "success",
            audioUrl: "/api/reference-assets/audio.wav",
            dialogueAudio: {
                status: "success",
                voice: "nova",
                speed: 1.25,
                instructions: "保持自然",
                mimeType: "audio/wav",
            },
        });
        await expect(syncDramaLabAudioTask({ userId: "wrong-user", project, episodeId: "episode-one", shotId: "shot-one", taskId: "task-one" })).rejects.toThrow("音频任务上下文");
    });

    it("rejects an explicitly cross-track sync for an untyped legacy task", async () => {
        mocks.getAudioTask.mockResolvedValue({ id: "task-one", userId: "user-one", surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", status: "running" });
        await expect(syncDramaLabAudioTask({ userId: "user-one", project, episodeId: "episode-one", shotId: "shot-one", taskId: "task-one", kind: "narration" })).rejects.toThrow("旧版音频任务与请求的音频轨道不匹配");
    });

    it("accepts a legacy root task for the missing track during a dialogue-only migration", () => {
        const partiallyMigrated = {
            ...project.episodes[0].shots[0],
            dialogue: "",
            narration: "夜色降临。",
            subtitle: "",
            utterances: [],
            dialogueAudio: { status: "success" as const, taskId: "dialogue-task", url: "/dialogue.mp3" },
            narrationAudio: undefined,
            audioTaskId: "legacy-narration-task",
            audioUrl: "/narration.mp3",
        };
        expect(() => assertAudioTaskBinding(partiallyMigrated, "narration", "legacy-narration-task")).not.toThrow();
        expect(() => assertAudioTaskContext(
            { userId: "user-one", surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one" },
            { userId: "user-one", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", audioKind: "narration", shot: partiallyMigrated },
        )).not.toThrow();
        expect(() => assertAudioTaskBinding(partiallyMigrated, "dialogue", "legacy-narration-task")).toThrow("音频任务未绑定");
        // Context alone cannot identify a task id when the requested track is
        // already dedicated; the binding assertion above is the authority.
    });

    it("accepts the symmetric narration-only migration and rejects an ambiguous root task", () => {
        const partiallyMigrated = {
            ...project.episodes[0].shots[0],
            dialogue: "她推开门。",
            narration: "",
            subtitle: "",
            utterances: [],
            dialogueAudio: undefined,
            narrationAudio: { status: "success" as const, taskId: "narration-task", url: "/narration.mp3" },
            audioTaskId: "legacy-dialogue-task",
            audioUrl: "/dialogue.mp3",
        };
        expect(() => assertAudioTaskBinding(partiallyMigrated, "dialogue", "legacy-dialogue-task")).not.toThrow();
        expect(legacyDramaAudioTaskId(partiallyMigrated, "narration")).toBeUndefined();

        const ambiguous = { ...partiallyMigrated, dialogue: "对白", narration: "旁白" };
        expect(() => assertAudioTaskBinding(ambiguous, "dialogue", "legacy-dialogue-task")).toThrow("音频任务未绑定");
        expect(() => assertAudioTaskBinding(ambiguous, "narration", "legacy-dialogue-task")).toThrow("音频任务未绑定");
        // The narration track is already dedicated, so ambiguity in the root
        // projection must not make it eligible for narration recovery.
    });

    it("keeps explicit task audioKind authoritative after a partial migration", () => {
        const partiallyMigrated = {
            ...project.episodes[0].shots[0],
            dialogue: "",
            narration: "夜色降临。",
            subtitle: "",
            utterances: [],
            dialogueAudio: { status: "success" as const, taskId: "dialogue-task", url: "/dialogue.mp3" },
            narrationAudio: undefined,
            audioTaskId: "legacy-narration-task",
        };
        expect(() => assertAudioTaskContext(
            { userId: "user-one", surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", audioKind: "dialogue" },
            { userId: "user-one", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", audioKind: "narration", shot: partiallyMigrated },
        )).toThrow("does not match");
    });

    it("rejects an untyped root task for the opposite track during partial migration", () => {
        const shot = {
            ...project.episodes[0].shots[0],
            dialogue: "",
            narration: "旁白内容",
            subtitle: "",
            utterances: [],
            dialogueAudio: undefined,
            narrationAudio: { status: "success" as const, taskId: "narration-task", url: "/narration.mp3" },
            audioTaskId: "legacy-narration-task",
        };
        expect(() => assertAudioTaskContext(
            { userId: "user-one", surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one" },
            { userId: "user-one", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", audioKind: "dialogue", shot },
        )).toThrow("旧版音频任务与请求的音频轨道不匹配");

        const ambiguous = { ...shot, dialogue: "对白内容", narration: "旁白内容" };
        expect(() => assertAudioTaskContext(
            { userId: "user-one", surface: "drama", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one" },
            { userId: "user-one", projectId: "project-one", episodeId: "episode-one", shotId: "shot-one", audioKind: "dialogue", shot: ambiguous },
        )).toThrow("旧版音频任务与请求的音频轨道不匹配");
    });

    it("never reuses a root projection that is the opposite track's task", () => {
        const shot = {
            ...project.episodes[0].shots[0],
            dialogue: "",
            narration: "旁白内容",
            subtitle: "",
            utterances: [],
            dialogueAudio: { status: "success" as const, taskId: "same-task", url: "/dialogue.mp3" },
            narrationAudio: undefined,
            audioTaskId: "same-task",
        };
        expect(legacyDramaAudioTaskId(shot, "narration")).toBeUndefined();
        expect(() => assertAudioTaskBinding(shot, "narration", "same-task")).toThrow("音频任务未绑定");

        const symmetric = {
            ...shot,
            dialogue: "对白内容",
            narration: "",
            dialogueAudio: undefined,
            narrationAudio: { status: "success" as const, taskId: "same-task", url: "/narration.mp3" },
        };
        expect(legacyDramaAudioTaskId(symmetric, "dialogue")).toBeUndefined();
        expect(() => assertAudioTaskBinding(symmetric, "dialogue", "same-task")).toThrow("音频任务未绑定");
    });

    it("writes a recovered legacy task only to its missing track", async () => {
        const partiallyMigrated = {
            ...project.episodes[0].shots[0],
            dialogue: "",
            narration: "夜色降临。",
            subtitle: "",
            utterances: [],
            dialogueAudio: { status: "success" as const, taskId: "dialogue-task", url: "/dialogue.mp3" },
            narrationAudio: undefined,
            audioTaskId: "legacy-narration-task",
            audioUrl: "/narration.mp3",
        };
        const partiallyMigratedProject = {
            ...project,
            episodes: [{ ...project.episodes[0], shots: [partiallyMigrated] }],
        };
        mocks.getAudioTask.mockResolvedValue({
            id: "legacy-narration-task",
            userId: "user-one",
            surface: "drama",
            projectId: "project-one",
            episodeId: "episode-one",
            shotId: "shot-one",
            status: "success",
            result: { url: "/narration-result.mp3", mimeType: "audio/mpeg" },
        });
        mocks.updateDramaProject.mockImplementation(async (_user: string, next: unknown) => next);
        const updated = await syncDramaLabAudioTask({
            userId: "user-one",
            project: partiallyMigratedProject,
            episodeId: "episode-one",
            shotId: "shot-one",
            taskId: "legacy-narration-task",
            kind: "narration",
        });
        expect(updated.episodes[0].shots[0]).toMatchObject({
            dialogueAudio: { taskId: "dialogue-task", url: "/dialogue.mp3" },
            narrationAudio: { taskId: "legacy-narration-task", url: "/narration-result.mp3", status: "success" },
        });
    });
});
