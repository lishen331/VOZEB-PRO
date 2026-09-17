import { describe, expect, it } from "vitest";
import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { OneClickFramePromptError, isOneClickFrameType, listOneClickFramePrompts, saveOneClickFramePrompt } from "./frame-prompts";

/**
 * 基线：L `framePromptService.saveFramePrompt` = DELETE 同 (storyboard_id, frame_type) 后 INSERT，
 * 即 prompt/description/layout 整条覆盖；已生成的图片状态不在该表内，保存提示词不得影响。
 */
function shot(extra: Partial<DramaShot> = {}): DramaShot {
    return {
        id: "s1",
        order: 1,
        title: "镜头1",
        description: "",
        sourceText: "",
        shotBoundary: "",
        dialogue: "",
        narration: "",
        utterances: [],
        imagePrompt: "",
        videoPrompt: "",
        cameraMotion: "",
        duration: 3,
        characterIds: [],
        propIds: [],
        clueIds: [],
        ...extra,
    };
}

function project(s: DramaShot): DramaProject {
    return { id: "p1", sourceHandoffId: "one-click-film:abc", characters: [], scenes: [], props: [], clues: [], episodes: [{ id: "e1", shots: [s] }] } as unknown as DramaProject;
}

describe("one-click-film frame prompts (L parity)", () => {
    it("accepts only the frame types L actually persists", () => {
        expect(isOneClickFrameType("first")).toBe(true);
        expect(isOneClickFrameType("key")).toBe(true);
        expect(isOneClickFrameType("last")).toBe(true);
        // L 路由校验里列了 panel/action，但全仓库确认从未落库
        expect(isOneClickFrameType("panel")).toBe(false);
        expect(isOneClickFrameType("action")).toBe(false);
    });

    it("saves prompt, description and layout together", () => {
        const { project: next, framePrompts } = saveOneClickFramePrompt(project(shot()), "e1", "s1", "first", {
            prompt: "首帧提示词",
            description: "首帧描述",
            layout: "左中景，人物居右",
        });

        expect(framePrompts).toEqual([{ frameType: "first", prompt: "首帧提示词", description: "首帧描述", layout: "左中景，人物居右" }]);
        expect(next.episodes[0].shots[0].frames?.first?.layout).toBe("左中景，人物居右");
    });

    it("overwrites the whole record, clearing description and layout when omitted", () => {
        const seeded = project(shot({ frames: { first: { prompt: "旧", description: "旧描述", layout: "旧布局", status: "success" } } }));
        const { project: next } = saveOneClickFramePrompt(seeded, "e1", "s1", "first", { prompt: "新提示词" });
        const frame = next.episodes[0].shots[0].frames?.first;

        expect(frame?.prompt).toBe("新提示词");
        // L 的 DELETE+INSERT 覆盖语义：未传即为 null
        expect(frame?.description).toBeUndefined();
        expect(frame?.layout).toBeUndefined();
    });

    it("never discards generated image state when saving a prompt", () => {
        const seeded = project(shot({ frames: { key: { prompt: "旧", status: "success", url: "https://cdn/key.png", taskId: "task-1", attempt: 2 } } }));
        const { project: next } = saveOneClickFramePrompt(seeded, "e1", "s1", "key", { prompt: "新关键帧提示词" });
        const frame = next.episodes[0].shots[0].frames?.key;

        expect(frame?.prompt).toBe("新关键帧提示词");
        // frame_prompts 表不含这些列，L 保存提示词不会动它们
        expect(frame?.url).toBe("https://cdn/key.png");
        expect(frame?.taskId).toBe("task-1");
        expect(frame?.attempt).toBe(2);
        expect(frame?.status).toBe("success");
    });

    it("rejects an empty prompt like L does", () => {
        expect(() => saveOneClickFramePrompt(project(shot()), "e1", "s1", "first", { prompt: "   " })).toThrow("prompt 不能为空");
    });

    it("lists only frames that have prompts, ordered first then key then last", () => {
        const seeded = project(
            shot({
                frames: {
                    last: { prompt: "尾帧", status: "idle" },
                    first: { prompt: "首帧", status: "idle" },
                    key: { prompt: "   ", status: "idle" },
                },
            }),
        );
        expect(listOneClickFramePrompts(seeded, "e1", "s1").map((item) => item.frameType)).toEqual(["first", "last"]);
    });

    it("reports missing episode and shot distinctly", () => {
        expect(() => listOneClickFramePrompts(project(shot()), "nope", "s1")).toThrow(OneClickFramePromptError);
        expect(() => listOneClickFramePrompts(project(shot()), "e1", "nope")).toThrow("分镜不存在");
    });

    it("does not mutate the input project", () => {
        const source = project(shot({ frames: { first: { prompt: "旧", status: "idle" } } }));
        const snapshot = structuredClone(source);
        saveOneClickFramePrompt(source, "e1", "s1", "first", { prompt: "新" });
        expect(source).toEqual(snapshot);
    });
});
