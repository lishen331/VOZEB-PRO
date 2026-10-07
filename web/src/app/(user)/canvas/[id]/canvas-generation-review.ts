import type { CanvasNodeData } from "../types";
import { markCanvasGenerationPending } from "./canvas-generation-feedback";

export function hasCanvasGenerationTask(node: CanvasNodeData) {
    const metadata = node.metadata;
    return Boolean(metadata?.imageTask || metadata?.videoTask || metadata?.textTask || metadata?.audioTask);
}

/**
 * 后端停在 needs_review 时：节点保持"生成中"、保留原任务 ID，由自动轮询继续追，
 * 不再给用户展示黄色"等待状态确认"和"检查状态"按钮。真实原因只进控制台。
 */
export function pauseCanvasGenerationReview(nodes: CanvasNodeData[], nodeIds: Iterable<string>, reason?: string) {
    if (reason) console.warn("[canvas-generation] still pending:", reason);
    return markCanvasGenerationPending(nodes, nodeIds, { review: true });
}
