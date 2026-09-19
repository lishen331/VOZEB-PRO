import { describe, expect, it } from "vitest";

import { buildSequenceGridPrompt, sequenceGridPanelCount, sequenceGridPanels, sequenceGridRects } from "./sequence-grid";

/**
 * 序列图模式的两处易错点：
 * 1. 切图几何 —— 奇数宽高时必须覆盖整图，不能在右/下边留黑缝；
 * 2. 网格提示词 —— 少了"禁止边框/禁止文字"约束，裁出来每张都带黑边或角标。
 */
describe("sequenceGridPanelCount", () => {
    it("maps each mode to its real panel count", () => {
        expect(sequenceGridPanelCount("quad_grid")).toBe(4);
        expect(sequenceGridPanelCount("nine_grid")).toBe(9);
        // single 表示不走序列图，调用方据此跳过整条拆图链路。
        expect(sequenceGridPanelCount("single")).toBe(0);
    });
});

describe("sequenceGridPanels", () => {
    it("keeps L's camera-angle order, which defines the produced panels", () => {
        expect(sequenceGridPanels("quad_grid").map((panel) => panel.label)).toEqual(["平视", "仰拍", "俯拍", "侧面"]);
        expect(sequenceGridPanels("nine_grid")).toHaveLength(9);
        expect(sequenceGridPanels("single")).toEqual([]);
    });
});

describe("sequenceGridRects", () => {
    it("covers the whole image with no gaps on even dimensions", () => {
        const rects = sequenceGridRects("quad_grid", 1024, 1024);
        expect(rects).toHaveLength(4);
        expect(rects.map((rect) => [rect.left, rect.top, rect.width, rect.height])).toEqual([
            [0, 0, 512, 512],
            [512, 0, 512, 512],
            [0, 512, 512, 512],
            [512, 512, 512, 512],
        ]);
    });

    it("gives the leftover pixels to the last column and row on odd dimensions", () => {
        // 1025 奇数：若每格固定 floor(w/2)=512，右边会丢 1 像素，裁出来带黑缝。
        const rects = sequenceGridRects("quad_grid", 1025, 1025);
        const right = Math.max(...rects.map((rect) => rect.left + rect.width));
        const bottom = Math.max(...rects.map((rect) => rect.top + rect.height));
        expect(right).toBe(1025);
        expect(bottom).toBe(1025);
    });

    it("tiles a 3x3 grid without overlap and without losing pixels", () => {
        const rects = sequenceGridRects("nine_grid", 1000, 700);
        expect(rects).toHaveLength(9);
        expect(rects.reduce((sum, rect) => sum + rect.width * rect.height, 0)).toBe(1000 * 700);
        expect(Math.max(...rects.map((rect) => rect.left + rect.width))).toBe(1000);
        expect(Math.max(...rects.map((rect) => rect.top + rect.height))).toBe(700);
        expect(rects.every((rect) => rect.width > 0 && rect.height > 0)).toBe(true);
    });

    it("refuses degenerate sizes instead of emitting zero-size crops", () => {
        expect(sequenceGridRects("quad_grid", 1, 1)).toEqual([]);
        expect(sequenceGridRects("nine_grid", 2, 2)).toEqual([]);
        expect(sequenceGridRects("quad_grid", 10.5, 10)).toEqual([]);
        expect(sequenceGridRects("single", 1024, 1024)).toEqual([]);
    });
});

describe("buildSequenceGridPrompt", () => {
    const four = ["站台左侧回头", "抬手接电话", "低头看裂屏", "转身走入雨里"];

    it("places every panel prompt with its own camera angle", () => {
        const prompt = buildSequenceGridPrompt({ mode: "quad_grid", panelPrompts: four });
        expect(prompt).toContain("2x2 grid");
        expect(prompt).toContain("EXACTLY 4 equal-sized panels");
        for (const text of four) expect(prompt).toContain(text);
        expect(prompt).toContain("eye-level shot");
        expect(prompt).toContain("side-angle profile shot");
        // 面板顺序必须与象限一一对应，否则挑到的机位跟标注不符。
        expect(prompt.indexOf("top-left quadrant")).toBeLessThan(prompt.indexOf("bottom-right quadrant"));
    });

    it("keeps the no-border and no-text constraints that make cropping usable", () => {
        const prompt = buildSequenceGridPrompt({ mode: "quad_grid", panelPrompts: four });
        expect(prompt).toContain("NO borders");
        expect(prompt).toContain("NO dividing lines");
        // V 不烧角标，也必须禁止模型自己画文字标签。
        expect(prompt).toContain("Do NOT draw any text, labels or panel numbers inside the image");
    });

    it("puts the style head first so it keeps top priority", () => {
        const prompt = buildSequenceGridPrompt({ mode: "quad_grid", panelPrompts: four, styleHead: "【画风·最高优先级】写实" });
        expect(prompt.startsWith("【画风·最高优先级】写实")).toBe(true);
    });

    it("builds a 3x3 grid for nine panels", () => {
        const nine = Array.from({ length: 9 }, (_, index) => `镜头${index + 1}`);
        const prompt = buildSequenceGridPrompt({ mode: "nine_grid", panelPrompts: nine });
        expect(prompt).toContain("3x3 grid");
        expect(prompt).toContain("EXACTLY 9 equal-sized panels");
        expect(prompt).toContain("center, low-angle");
    });

    it("fails loudly on a panel-count mismatch instead of silently dropping prompts", () => {
        expect(() => buildSequenceGridPrompt({ mode: "quad_grid", panelPrompts: ["只有一条"] })).toThrow("需要 4 条面板提示词");
        expect(buildSequenceGridPrompt({ mode: "single", panelPrompts: [] })).toBe("");
    });
});
