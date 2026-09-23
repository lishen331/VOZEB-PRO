import { describe, expect, it } from "vitest";
import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import contract from "./photography-inference-l-contract.json";
import { OneClickPhotographyInferenceError, inferOneClickEpisodePhotography, inferOneClickPhotographyParams } from "./photography-inference";

/**
 * 基线：L `angleService.inferPhotographyParams` + `storyboards.batchInferParams`。
 * 规则表已用 113 个样本与 L 真实输出比对过 0 不一致，这里锁死关键行为。
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

function project(shots: DramaShot[]): DramaProject {
    return { id: "p1", characters: [], scenes: [], props: [], clues: [], episodes: [{ id: "e1", shots }] } as unknown as DramaProject;
}

describe("one-click-film photography inference (L parity)", () => {
    it("keeps L's lighting rule order as priority", () => {
        // 顺序即优先级：neon 在 night 之前，"霓虹夜色"必须取 neon
        expect(contract.lightingRules[0].value).toBe("neon");
        expect(contract.lightingRules.findIndex((rule) => rule.value === "neon")).toBeLessThan(contract.lightingRules.findIndex((rule) => rule.value === "night"));
        expect(inferOneClickPhotographyParams(shot({ atmosphere: "霓虹夜色", time: "深夜" })).lightingStyle).toBe("neon");
    });

    it("infers lighting from atmosphere, time, description and action combined", () => {
        expect(inferOneClickPhotographyParams(shot({ atmosphere: "逆光轮廓" })).lightingStyle).toBe("backlit");
        expect(inferOneClickPhotographyParams(shot({ atmosphere: "戏剧强对比" })).lightingStyle).toBe("dramatic");
        expect(inferOneClickPhotographyParams(shot({ time: "黄昏" })).lightingStyle).toBe("golden_hour");
        expect(inferOneClickPhotographyParams(shot({ time: "暮色蓝调" })).lightingStyle).toBe("blue_hour");
        expect(inferOneClickPhotographyParams(shot({ description: "柔光散射的房间" })).lightingStyle).toBe("soft");
        expect(inferOneClickPhotographyParams(shot({ action: "走进清晨的巷子" })).lightingStyle).toBe("natural");
        expect(inferOneClickPhotographyParams(shot()).lightingStyle).toBeNull();
    });

    it("derives depth of field from the structured shot size first", () => {
        expect(inferOneClickPhotographyParams(shot({ angleS: "close_up" })).depthOfField).toBe("shallow");
        expect(inferOneClickPhotographyParams(shot({ angleS: "wide" })).depthOfField).toBe("deep");
        expect(inferOneClickPhotographyParams(shot({ angleS: "medium" })).depthOfField).toBe("medium");
        // 没有结构化景别时回落自由文本
        expect(inferOneClickPhotographyParams(shot({ shotType: "特写" })).depthOfField).toBe("shallow");
        expect(inferOneClickPhotographyParams(shot({ shotType: "远景" })).depthOfField).toBe("deep");
        expect(inferOneClickPhotographyParams(shot({ shotType: "medium shot" })).depthOfField).toBe("medium");
        expect(inferOneClickPhotographyParams(shot()).depthOfField).toBeNull();
    });

    it("maps Chinese camera motion to L's enum but keeps unknown text as-is", () => {
        expect(inferOneClickPhotographyParams(shot({ cameraMotion: "缓慢推进" })).cameraMotion).toBe("push");
        expect(inferOneClickPhotographyParams(shot({ cameraMotion: "跟拍" })).cameraMotion).toBe("tracking");
        expect(inferOneClickPhotographyParams(shot({ cameraMotion: "手持" })).cameraMotion).toBe("handheld");
        // 已是枚举值直接用
        expect(inferOneClickPhotographyParams(shot({ cameraMotion: "orbit" })).cameraMotion).toBe("orbit");
        // 认不出的中文保留原样，生图时再翻译（L 的兜底行为）
        expect(inferOneClickPhotographyParams(shot({ cameraMotion: "自定义甩镜" })).cameraMotion).toBe("自定义甩镜");
        expect(inferOneClickPhotographyParams(shot()).cameraMotion).toBeNull();
    });

    it("only fills missing fields unless overwrite is set", () => {
        const source = project([shot({ id: "s1", atmosphere: "霓虹", angleS: "close_up", lightingStyle: "已有灯光" })]);
        const filled = inferOneClickEpisodePhotography(source, "e1");

        // 已有值不动，这是 L 的 COALESCE 语义
        expect(filled.project.episodes[0].shots[0].lightingStyle).toBe("已有灯光");
        // 缺失的补上
        expect(filled.project.episodes[0].shots[0].depthOfField).toBe("shallow");
        expect(filled.updated).toBe(1);

        const overwritten = inferOneClickEpisodePhotography(source, "e1", true);
        expect(overwritten.project.episodes[0].shots[0].lightingStyle).toBe("neon");
    });

    it("counts only shots that actually changed", () => {
        // 已经等于推断值 → 不计入 updated，也不重写项目
        const settled = project([shot({ atmosphere: "霓虹", angleS: "close_up", lightingStyle: "neon", depthOfField: "shallow" })]);
        const result = inferOneClickEpisodePhotography(settled, "e1");
        expect(result.updated).toBe(0);
        expect(result.total).toBe(1);
        expect(result.project).toBe(settled);

        // 没有任何可推断信息的分镜也不计入
        const blank = project([shot()]);
        expect(inferOneClickEpisodePhotography(blank, "e1").updated).toBe(0);
    });

    it("reports a missing episode as 404 and does not mutate input", () => {
        const source = project([shot({ atmosphere: "霓虹" })]);
        const snapshot = structuredClone(source);
        expect(() => inferOneClickEpisodePhotography(source, "nope")).toThrow(OneClickPhotographyInferenceError);
        inferOneClickEpisodePhotography(source, "e1");
        expect(source).toEqual(snapshot);
    });
});
