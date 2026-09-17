import { describe, expect, it } from "vitest";
import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { OneClickImagePolishError, assertOneClickImagePolishable, buildOneClickImagePolishRequest } from "./image-polish-service";
import systemPrompts from "./image-polish-l-system.json";

/**
 * 基线：L `storyboards.js` 的 polishPrompt handler + promptI18n.getImagePolishPrompt 中文分支。
 * 这里锁死"最终发给文本模型的载荷"，防止有人悄悄改写字段或替换系统提示词。
 */
function shot(extra: Partial<DramaShot> = {}): DramaShot {
    return {
        id: "s2",
        order: 2,
        title: "镜头2",
        description: "描述2",
        sourceText: "原文2",
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

const episode = (shots: DramaShot[]) => ({ id: "e1", shots }) as unknown as DramaEpisode;
const project = () =>
    ({
        id: "p1",
        style: "电影感国漫",
        characters: [{ id: "c1", name: "林薇" }],
        scenes: [{ id: "sc1", name: "雨夜车站" }],
        props: [{ id: "pr1", name: "裂屏手机" }],
        clues: [],
        episodes: [],
    }) as unknown as DramaProject;

describe("one-click-film image prompt polish (L parity)", () => {
    it("uses L's verbatim Chinese polish system prompt", () => {
        expect(systemPrompts.getImagePolishPrompt).toContain("你是一个专业的电影分镜图像生成提示词优化专家");
        expect(systemPrompts.getImagePolishPrompt).toContain("静态单帧画面");
        // L 的铁律：禁止在提示词里写服装
        expect(systemPrompts.getImagePolishPrompt).toContain("角色外貌描述铁律");
        expect(systemPrompts.getImagePolishPrompt).toContain("请直接输出一段纯中文 prompt 文字。");
    });

    it("orders the user payload exactly like L's userPromptLines", () => {
        const target = shot({ imagePrompt: "中景，雨水映霓虹", action: "接起电话", dialogue: "喂？", result: "她愣住", atmosphere: "冷蓝", shotType: "中景", characterIds: ["c1"], propIds: ["pr1"], sceneId: "sc1" });
        const request = buildOneClickImagePolishRequest({ project: project(), episode: episode([shot({ id: "s1", order: 1, action: "上一镜动作" }), target, shot({ id: "s3", order: 3, action: "下一镜动作" })]), shot: target });
        const lines = request.userPrompt.split("\n");

        expect(lines[0]).toBe("【画风·最高优先级】电影感国漫");
        expect(lines[1]).toBe("PROMPT: 中景，雨水映霓虹");
        expect(lines[2]).toBe("ACTION: 接起电话");
        expect(lines[3]).toBe("DIALOGUE: 喂？");
        expect(lines[4]).toBe("RESULT: 她愣住");
        expect(lines[5]).toBe("ATMOSPHERE: 冷蓝");
        expect(lines[6]).toBe("SHOT_TYPE: 中景");
        expect(lines[7]).toBe("STYLE_TOKENS (repeat in output): 电影感国漫");
        // 资产顺序：角色 → 道具 → 场景
        expect(lines[8]).toBe("ASSETS: 林薇, 裂屏手机, 雨夜车站");
        expect(lines[9]).toBe("CONTEXT_PREV: 上一镜动作");
        expect(lines[10]).toBe("CONTEXT_NEXT: 下一镜动作");
        expect(lines[11]).toContain("STATIC SINGLE-FRAME");
    });

    it("marks first and last shot context like L does", () => {
        const only = shot({ imagePrompt: "唯一一镜" });
        const request = buildOneClickImagePolishRequest({ project: project(), episode: episode([only]), shot: only });
        expect(request.userPrompt).toContain("CONTEXT_PREV: (first shot)");
        expect(request.userPrompt).toContain("CONTEXT_NEXT: (last shot)");
    });

    it("omits empty optional fields instead of sending blank labels", () => {
        const sparse = shot({ imagePrompt: "只有图片提示词" });
        const request = buildOneClickImagePolishRequest({ project: project(), episode: episode([sparse]), shot: sparse });
        expect(request.userPrompt).not.toContain("ACTION:");
        expect(request.userPrompt).not.toContain("DIALOGUE:");
        expect(request.userPrompt).not.toContain("RESULT:");
        expect(request.userPrompt).toContain("ASSETS: none");
    });

    it("refuses a shot with nothing to polish, matching L's guard", () => {
        expect(() => assertOneClickImagePolishable(shot())).toThrow(OneClickImagePolishError);
        expect(() => assertOneClickImagePolishable(shot())).toThrow("暂无可优化的内容");
        // 三者任一即可
        expect(() => assertOneClickImagePolishable(shot({ dialogue: "有对白" }))).not.toThrow();
        expect(() => assertOneClickImagePolishable(shot({ action: "有动作" }))).not.toThrow();
        expect(() => assertOneClickImagePolishable(shot({ imagePrompt: "有提示词" }))).not.toThrow();
    });
});
