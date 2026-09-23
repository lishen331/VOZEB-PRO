import type { DramaLabStoryboardSequenceMode } from "@/lib/drama-lab-storyboard-options";

/**
 * 序列图模式（四宫格 / 九宫格）的纯逻辑：机位表、网格提示词、切图几何。
 *
 * 这个模式的价值是"一次上游调用换多个候选构图"：模型输出一张 2x2 或 3x3 拼贴，
 * 每格沿 L 的首帧→关键帧→尾帧时间线，分别规划不同机位，随后本地按象限裁开，
 * 每格变成一个可挑选的候选分镜图。裁剪是纯本地操作，不调模型、不计费。
 *
 * 必须拆的原因在下游：分镜图要当生视频的首帧/参考图。把一张拼贴喂给视频模型，
 * 它会去动整张拼贴而不是其中一格。
 *
 * 与 L 的一处**故意不一致**：L 在每格左上角烧了「左上」「俯拍」之类的 SVG 角标
 * （imageService.js:141-147）。V 不烧 —— 因为选中的那张会直接作为视频参考图，
 * 烧进去的角标会出现在成片画面里。机位标签只走 UI 展示（见 panel.label）。
 */

/** 机位表照抄 L：顺序即面板顺序，改顺序等于改产物。 */
const QUAD_ANGLES = [
    { label: "平视", en: "eye-level shot", stage: "initial state" },
    { label: "仰拍", en: "low-angle upward shot", stage: "key action moment" },
    { label: "俯拍", en: "high-angle downward shot (bird's eye)", stage: "action continuation" },
    { label: "侧面", en: "side-angle profile shot", stage: "final state" },
] as const;

const NINE_ANGLES = [
    { label: "平视", en: "eye-level shot" },
    { label: "仰拍", en: "low-angle upward shot" },
    { label: "俯拍", en: "high-angle downward shot (bird's eye)" },
    { label: "侧面左", en: "left profile side shot" },
    { label: "侧面右", en: "right profile side shot" },
    { label: "背面", en: "rear shot from behind the character" },
    { label: "极端仰拍", en: "extreme low angle (worm's eye view)" },
    { label: "极端俯拍", en: "extreme high angle (aerial top-down view)" },
    { label: "斜侧45度", en: "diagonal 45-degree angle shot" },
] as const;

export type SequenceGridPanel = {
    index: number;
    /** 机位中文名，仅用于 UI 标注，不烧进图片。 */
    label: string;
    angleEn: string;
};

/** 该模式需要多少个面板；single 返回 0，表示不走序列图。 */
export function sequenceGridPanelCount(mode: DramaLabStoryboardSequenceMode) {
    return mode === "quad_grid" ? 4 : mode === "nine_grid" ? 9 : 0;
}

export function sequenceGridPanels(mode: DramaLabStoryboardSequenceMode): SequenceGridPanel[] {
    const angles = mode === "quad_grid" ? QUAD_ANGLES : mode === "nine_grid" ? NINE_ANGLES : [];
    return angles.map((angle, index) => ({ index, label: angle.label, angleEn: angle.en }));
}

export type SequenceGridRect = { index: number; label: string; left: number; top: number; width: number; height: number };

/**
 * 按象限计算裁剪矩形。
 *
 * 用"下一条边界减本条边界"而不是"每格固定 floor(w/cols)"：奇数宽高时前者能把余下的
 * 1~2 像素分给最后一列/行，保证覆盖整图不丢边；后者会在右边和下边各留一条黑缝。
 */
export function sequenceGridRects(mode: DramaLabStoryboardSequenceMode, width: number, height: number): SequenceGridRect[] {
    const panels = sequenceGridPanels(mode);
    if (!panels.length) return [];
    const cols = mode === "quad_grid" ? 2 : 3;
    const rows = cols;
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < cols || height < rows) return [];
    const edge = (total: number, count: number, index: number) => Math.floor((total * index) / count);
    return panels.map((panel) => {
        const col = panel.index % cols;
        const row = Math.floor(panel.index / cols);
        const left = edge(width, cols, col);
        const top = edge(height, rows, row);
        return { index: panel.index, label: panel.label, left, top, width: edge(width, cols, col + 1) - left, height: edge(height, rows, row + 1) - top };
    });
}

/**
 * 用每格的帧提示词拼出网格提示词。
 *
 * 约束照抄 L：必须等分、无边框、无分割线、无间隙，且各格机位必须明显不同。
 * 少了"禁止边框"这条，模型很爱画黑框，裁出来每张边缘都带半条黑线。
 */
export function buildSequenceGridPrompt(input: { mode: DramaLabStoryboardSequenceMode; panelPrompts: string[]; styleHead?: string }) {
    const panels = sequenceGridPanels(input.mode);
    if (!panels.length) return "";
    if (input.panelPrompts.length !== panels.length) throw new Error(`序列图需要 ${panels.length} 条面板提示词，收到 ${input.panelPrompts.length} 条`);
    const rowNames = ["TOP ROW", "MIDDLE ROW", "BOTTOM ROW"];
    const colNames = ["left", "center", "right"];
    const rowBlocks = rowNames
        .map(
            (row, r) =>
                row +
                " (left to right):\n" +
                panels
                    .slice(r * 3, r * 3 + 3)
                    .map((panel) => `[Panel ${panel.index + 1} - ${colNames[panel.index % 3]}, ${panel.angleEn}]: ${input.panelPrompts[panel.index]}`)
                    .join("\n"),
        )
        .join("\n\n");
    const core =
        input.mode === "quad_grid"
            ? `Create a 2x2 grid storyboard image with EXACTLY 4 equal-sized panels arranged in 2 rows and 2 columns (like a coordinate quadrant layout). Each panel occupies exactly one quadrant of the image. NO borders of any color (black, white, gray), NO dividing lines, NO frames between panels — the 4 panels must be seamlessly adjacent with no gaps or separators.

Each panel uses a DIFFERENT camera angle to show the same scene from varied perspectives — this is intentional and required.

TOP ROW (left to right):
[Panel 1 - top-left quadrant, ${panels[0].angleEn}, initial state]: ${input.panelPrompts[0]}
[Panel 2 - top-right quadrant, ${panels[1].angleEn}, key action moment]: ${input.panelPrompts[1]}

BOTTOM ROW (left to right):
[Panel 3 - bottom-left quadrant, ${panels[2].angleEn}, action continuation]: ${input.panelPrompts[2]}
[Panel 4 - bottom-right quadrant, ${panels[3].angleEn}, final state]: ${input.panelPrompts[3]}

CRITICAL LAYOUT RULES: The image MUST be divided into 4 equal quadrants in a 2x2 grid. Do NOT arrange panels in a single strip. Do NOT add any black or dark borders/frames around the panels. Each panel is self-contained with consistent character appearance and art style. The camera angle MUST visually differ between panels as specified above.`
            : `Create a 3x3 grid storyboard image with EXACTLY 9 equal-sized panels arranged in 3 rows and 3 columns. Each panel occupies exactly one cell of the 3×3 grid. NO borders of any color (black, white, gray), NO dividing lines, NO frames between panels — all 9 panels must be seamlessly adjacent with no gaps or separators.

Each panel uses a DIFFERENT camera angle to show the same scene from varied cinematic perspectives — this is intentional and required.

${rowBlocks}

CRITICAL LAYOUT RULES: The image MUST be divided into 9 equal cells in a 3×3 grid. Do NOT arrange panels in a single strip. Do NOT add any borders or frames. Each panel is self-contained with consistent character appearance and art style. The camera angle MUST visually differ between panels as specified above.`;
    return [input.styleHead?.trim(), core, "Do NOT draw any text, labels or panel numbers inside the image."].filter(Boolean).join("\n\n");
}
