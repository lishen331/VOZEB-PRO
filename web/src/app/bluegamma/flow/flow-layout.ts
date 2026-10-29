import type { FlowStepKind, MajorFlow } from "@/app/bluegamma/flow/flow-types";

/* 画布坐标：所有步骤排成一行，间距固定；跨步引用画成从上方绕过的弧线 */

export const NODE_W = 264;
export const NODE_BODY_H = 168;
export const NODE_GAP = 104;
export const ROW_Y = 260;
export const ORIGIN_X = 96;

export const KIND_COST: Record<FlowStepKind, number> = { text: 2, image: 12, video: 40, audio: 6 };
export const KIND_LABEL: Record<FlowStepKind, string> = { text: "文本", image: "图片", video: "视频", audio: "音频" };
export const KIND_MODEL: Record<FlowStepKind, string> = { text: "DeepSeek-V4", image: "GPT Image-2", video: "可灵 3.0", audio: "MiniMax Speech" };

export function nodeX(index: number) {
    return ORIGIN_X + index * (NODE_W + NODE_GAP);
}

export function canvasWidth(flow: MajorFlow) {
    return nodeX(flow.steps.length) + ORIGIN_X;
}

/** 从 from 步到 to 步的连线路径；相邻直连，跨步从上方拱起 */
export function edgePath(fromIndex: number, toIndex: number) {
    const y = ROW_Y + NODE_BODY_H / 2;
    const x1 = nodeX(fromIndex) + NODE_W;
    const x2 = nodeX(toIndex);
    const span = toIndex - fromIndex;
    if (span <= 1) {
        const mid = (x1 + x2) / 2;
        return `M ${x1} ${y} C ${mid} ${y}, ${mid} ${y}, ${x2} ${y}`;
    }
    const lift = 70 + span * 34;
    return `M ${x1} ${y} C ${x1 + 70} ${y - lift}, ${x2 - 70} ${y - lift}, ${x2} ${y}`;
}
