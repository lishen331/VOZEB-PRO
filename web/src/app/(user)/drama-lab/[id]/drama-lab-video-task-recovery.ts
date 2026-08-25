export type DramaLabVideoTaskReviewState = {
    generationNeedsReview?: boolean;
    generationTaskId?: string;
    generationError?: string;
};

export function requiresDramaLabVideoTaskCheck(shot: DramaLabVideoTaskReviewState) {
    return shot.generationNeedsReview === true && Boolean(shot.generationTaskId?.trim());
}

export function dramaLabVideoTaskReviewDescription(shot: DramaLabVideoTaskReviewState) {
    const reason = shot.generationError?.trim();
    const taskHint = shot.generationTaskId?.trim() ? `原任务 ${shot.generationTaskId}` : "原视频任务";
    return `${reason || "视频结果尚未完成本地保存。"} 已停止自动轮询；点击“检查状态”只会查询${taskHint}，不会重新提交或重复扣费。`;
}
