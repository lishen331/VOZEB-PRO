import { describe, expect, it } from "vitest";
import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import angleContract from "./angle-l-contract.json";
import { OneClickVideoPromptRebuildError, findOneClickRebuildTarget, oneClickAngleChineseLabel, oneClickAnglePromptFragment, oneClickNormalizeDuration, rebuildOneClickVideoPrompt } from "./video-prompt-rebuild";

/**
 * 基线：L `episodeStoryboardService.generateVideoPrompt` + `angleService`。
 * 该链路是纯本地模板重组（已核实无 AI 调用），所以可以逐字锁死输出。
 */
function shot(extra: Partial<DramaShot> = {}): DramaShot {
    return {
        id: "s1",
        order: 1,
        title: "",
        description: "",
        sourceText: "",
        shotBoundary: "",
        dialogue: "",
        narration: "",
        utterances: [],
        imagePrompt: "",
        videoPrompt: "",
        cameraMotion: "",
        duration: 0,
        characterIds: [],
        propIds: [],
        clueIds: [],
        ...extra,
    };
}

const project = () => ({ id: "p1", style: "电影感国漫", ratio: "9:16", episodes: [], characters: [], scenes: [], props: [], clues: [] }) as unknown as DramaProject;

describe("one-click-film video prompt rebuild (L parity)", () => {
    it("keeps L's angle contract for all 96 combinations", () => {
        const horizontal = Object.keys(angleContract.horizontalDesc);
        const elevation = Object.keys(angleContract.elevationDesc);
        const shotSize = Object.keys(angleContract.shotSizeDesc);
        expect(horizontal).toHaveLength(8);
        expect(elevation).toHaveLength(4);
        expect(shotSize).toHaveLength(3);

        // L 的拼接顺序是 景别 → 俯仰 → 水平
        expect(oneClickAnglePromptFragment("front", "eye_level", "medium")).toBe(`${angleContract.shotSizeDesc.medium}, ${angleContract.elevationDesc.eye_level}, ${angleContract.horizontalDesc.front}`);
        expect(oneClickAngleChineseLabel("front", "eye_level", "medium")).toBe("中景·平视·正面");
        expect(oneClickAngleChineseLabel("back", "worm", "close_up")).toBe("特写·虫眼仰·背面");
        // 未知值回退到 L 的默认档
        expect(oneClickAngleChineseLabel("nope", "nope", "nope")).toBe("中景·平视·正面");
    });

    it('normalizes duration like L, tolerating "5s" and rejecting junk', () => {
        expect(oneClickNormalizeDuration(5)).toBe(5);
        expect(oneClickNormalizeDuration("5s")).toBe(5);
        expect(oneClickNormalizeDuration("4.6")).toBe(5);
        expect(oneClickNormalizeDuration("")).toBe(0);
        expect(oneClickNormalizeDuration(undefined)).toBe(0);
        expect(oneClickNormalizeDuration("abc")).toBe(0);
        expect(oneClickNormalizeDuration(-3)).toBe(-3);
    });

    it("emits L's labelled segments joined by the full-width period", () => {
        const target = shot({
            location: "雨夜车站",
            time: "深夜",
            title: "雨夜来电",
            action: "接起电话",
            dialogue: "喂？",
            narration: "她等了很久",
            result: "她愣住",
            shotType: "中景",
            cameraMotion: "缓慢推进",
            atmosphere: "冷蓝",
            emotion: "不安",
            emotionIntensity: 7,
            duration: 6,
        });
        const output = rebuildOneClickVideoPrompt(project(), target);
        const parts = output.split("。");

        expect(parts[0]).toBe("场景：雨夜车站，深夜");
        expect(parts[1]).toBe("镜头标题：雨夜来电");
        expect(parts[2]).toBe("动作：接起电话");
        expect(parts[3]).toBe("对话：喂？");
        expect(parts[4]).toBe("解说旁白：她等了很久");
        expect(parts[5]).toBe("结果：她愣住");
        expect(parts[6]).toBe("景别：中景");
        expect(parts[7]).toBe("运镜：缓慢推进");
        expect(parts[8]).toBe("氛围：冷蓝");
        expect(parts[9]).toBe("情绪：不安");
        expect(parts[10]).toBe("情绪强度：7");
        expect(parts[11]).toBe("时长：6秒");
        expect(parts[12]).toBe("风格：电影感国漫");
        expect(parts[13]).toBe("=VideoRatio: 9:16");
    });

    it("prefers structured angles and falls back to the legacy free-text angle", () => {
        const structured = rebuildOneClickVideoPrompt(project(), shot({ angleH: "left", angleV: "low", angleS: "wide" }));
        expect(structured).toContain(`镜头角度：远景·仰拍·左侧（${oneClickAnglePromptFragment("left", "low", "wide")}）`);

        // 三段不齐时回退旧字段
        const legacy = rebuildOneClickVideoPrompt(project(), shot({ angleH: "left", cameraAngle: "低角度侧拍" }));
        expect(legacy).toContain("镜头角度：低角度侧拍");
        expect(legacy).not.toContain("（");
    });

    it("omits the time suffix when only a location exists", () => {
        expect(rebuildOneClickVideoPrompt(project(), shot({ location: "雨夜车站" }))).toContain("场景：雨夜车站。");
    });

    it("defaults duration to 5 seconds when missing, like L", () => {
        expect(rebuildOneClickVideoPrompt(project(), shot())).toContain("时长：5秒");
    });

    it("never returns an empty prompt", () => {
        const bare = rebuildOneClickVideoPrompt({ id: "p1", episodes: [] } as unknown as DramaProject, shot());
        // 即使项目没有风格/比例，至少含时长段
        expect(bare).toContain("时长：5秒");
    });

    it("reports missing episode and shot distinctly", () => {
        const source = { id: "p1", episodes: [{ id: "e1", shots: [shot()] }] } as unknown as DramaProject;
        expect(() => findOneClickRebuildTarget(source, "nope", "s1")).toThrow(OneClickVideoPromptRebuildError);
        expect(() => findOneClickRebuildTarget(source, "e1", "nope")).toThrow("分镜不存在");
        expect(findOneClickRebuildTarget(source, "e1", "s1").shot.id).toBe("s1");
    });
});
