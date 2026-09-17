import { describe, expect, it } from "vitest";
import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";
import systemPrompts from "./layout-regenerate-l-system.json";
import { buildOneClickLayoutRequest, sanitizeOneClickLayout } from "./layout-regenerate-service";

/**
 * 基线：L `framePromptService.regenerateLayoutDescription` +
 * promptI18n.getRegenerateLayoutDescriptionPrompt 中文分支。
 * 锁死最终发给文本模型的载荷与清洗规则。
 */
function shot(extra: Partial<DramaShot> = {}): DramaShot {
    return {
        id: "s2",
        order: 2,
        title: "镜头2",
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

const episode = (shots: DramaShot[]) => ({ id: "e1", shots }) as unknown as DramaEpisode;
const project = () =>
    ({
        id: "p1",
        characters: [
            { id: "c1", name: "林薇" },
            { id: "c2", name: "陈默" },
        ],
        scenes: [],
        props: [],
        clues: [],
        episodes: [],
    }) as unknown as DramaProject;

describe("one-click-film layout regenerate (L parity)", () => {
    it("uses L's verbatim Chinese layout system prompt", () => {
        expect(systemPrompts.getRegenerateLayoutDescriptionPrompt).toContain("你是一位专业的电影连戏监督与分镜空间设计师");
        expect(systemPrompts.getRegenerateLayoutDescriptionPrompt).toContain("layout_description");
        // L 的两条硬要求：真实尺度锚点 + 运镜演化空间
        expect(systemPrompts.getRegenerateLayoutDescriptionPrompt).toContain("真实尺度锚点");
        expect(systemPrompts.getRegenerateLayoutDescriptionPrompt).toContain("必须用中文输出");
    });

    it("orders the user payload exactly like L's userLines", () => {
        const target = shot({ action: "推门进入", result: "她停住", dialogue: "你来了", shotType: "中景", characterIds: ["c1", "c2"] });
        const request = buildOneClickLayoutRequest({
            project: project(),
            episode: episode([shot({ id: "s1", order: 1, layoutDescription: "上一镜布局" }), target, shot({ id: "s3", order: 3, layoutDescription: "下一镜布局" })]),
            shot: target,
        });
        const lines = request.userPrompt.split("\n");

        expect(lines[0]).toBe("CURRENT_SHOT #2");
        expect(lines[1]).toBe("ACTION: 推门进入");
        expect(lines[2]).toBe("RESULT: 她停住");
        expect(lines[3]).toBe("DIALOGUE: 你来了");
        expect(lines[4]).toBe("SHOT_TYPE: 中景");
        // L 用中文分号连接角色名
        expect(lines[5]).toBe("CHARACTERS: 林薇；陈默");
        expect(lines[6]).toBe("PREV_SHOT #1 LAYOUT: 上一镜布局");
        expect(lines[7]).toBe("NEXT_SHOT #3 LAYOUT: 下一镜布局");
        expect(lines[8]).toBe("请严格按照系统提示要求，只输出优化后的 layout_description 文本。");
    });

    it("marks first/last shot and missing neighbour layouts like L", () => {
        const only = shot({ action: "独镜" });
        const single = buildOneClickLayoutRequest({ project: project(), episode: episode([only]), shot: only });
        expect(single.userPrompt).toContain("PREV_SHOT: (first shot)");
        expect(single.userPrompt).toContain("NEXT_SHOT: (last shot)");

        // 邻镜存在但没有布局时，L 输出 (none)
        const middle = shot({ id: "s2", order: 2 });
        const withNeighbours = buildOneClickLayoutRequest({ project: project(), episode: episode([shot({ id: "s1", order: 1 }), middle, shot({ id: "s3", order: 3 })]), shot: middle });
        expect(withNeighbours.userPrompt).toContain("PREV_SHOT #1 LAYOUT: (none)");
        expect(withNeighbours.userPrompt).toContain("NEXT_SHOT #3 LAYOUT: (none)");
    });

    it("omits empty optional fields instead of sending blank labels", () => {
        const sparse = shot({ action: "只有动作" });
        const request = buildOneClickLayoutRequest({ project: project(), episode: episode([sparse]), shot: sparse });
        expect(request.userPrompt).not.toContain("RESULT:");
        expect(request.userPrompt).not.toContain("DIALOGUE:");
        expect(request.userPrompt).not.toContain("SHOT_TYPE:");
        expect(request.userPrompt).not.toContain("CHARACTERS:");
    });

    it("sanitizes model output the way L does", () => {
        expect(sanitizeOneClickLayout("```json\n林薇位于画面左三分之一\n```")).toBe("林薇位于画面左三分之一");
        expect(sanitizeOneClickLayout('"林薇位于画面左三分之一"')).toBe("林薇位于画面左三分之一");
        expect(sanitizeOneClickLayout("布局描述：林薇位于画面左三分之一")).toBe("林薇位于画面左三分之一");
        expect(sanitizeOneClickLayout("空间布局: 林薇位于画面左三分之一")).toBe("林薇位于画面左三分之一");
        expect(sanitizeOneClickLayout("  “林薇居中”  ")).toBe("林薇居中");
    });
});
