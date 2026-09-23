import type { DramaShot } from "@/lib/drama-project-contract";

export type BatchMediaKind = "image" | "video";

/** L `pipelineConcurrency` 的默认值。批量生成与 pipeline 共用同一并发模型。 */
export const BATCH_MEDIA_CONCURRENCY = 3;
/** 单镜等待上限：某个上游任务卡死时不能让整批永久挂住。 */
export const BATCH_MEDIA_TIMEOUT_MS = 10 * 60 * 1000;
export const BATCH_MEDIA_POLL_INTERVAL_MS = 3000;

/**
 * 该分镜是否已有成品。
 *
 * 与 L `hasSbImage` / `hasSbVideo` 一致：图片要把首/尾帧槽位算进去，
 * 否则首尾帧模式下已出图的分镜会被当成"没图"而重复生成、重复扣费。
 */
export function shotHasMedia(shot: DramaShot, kind: BatchMediaKind) {
    if (kind === "video") return Boolean(shot.videoUrl?.trim());
    return Boolean(shot.storyboardImageUrl?.trim() || shot.frames?.first?.url?.trim() || shot.frames?.last?.url?.trim());
}

export type BatchSettleState = { state: "done" } | { state: "pending" } | { state: "error"; error: string };

/** 判定单镜是否已结束。成品优先于状态字段：有图就算成，不纠结状态标记。 */
export function shotSettleState(shot: DramaShot | undefined, kind: BatchMediaKind): BatchSettleState {
    if (!shot) return { state: "pending" };
    if (shotHasMedia(shot, kind)) return { state: "done" };
    const status = kind === "image" ? shot.storyboardStatus : shot.generationStatus;
    const error = kind === "image" ? shot.storyboardError : shot.generationError;
    if (status === "error") return { state: "error", error: error?.trim() || "生成失败" };
    if (status === "cancelled") return { state: "error", error: error?.trim() || "任务已取消" };
    if (status === "success") return { state: "done" };
    return { state: "pending" };
}

export type BatchMediaProgress = { current: number; total: number; failed: number };

export type BatchMediaDeps = {
    /** 提交单镜生成任务。 */
    submit: (shot: DramaShot) => Promise<void>;
    /** 拉取最新分镜快照，用于判断是否结束。 */
    reload: () => Promise<DramaShot[]>;
    /** 是否已请求停止（L 的 batchImageStopping / batchVideoStopping 标志位）。 */
    shouldStop: () => boolean;
    onProgress?: (progress: BatchMediaProgress) => void;
    /** 注入便于测试；默认真实等待。 */
    wait?: (ms: number) => Promise<void>;
    now?: () => number;
    pollIntervalMs?: number;
    timeoutMs?: number;
    concurrency?: number;
};

export type BatchMediaResult = {
    total: number;
    completed: number;
    failed: number;
    errors: string[];
    stopped: boolean;
};

/**
 * 批量生成分镜图 / 分镜视频，对应 L 的 `startBatchImageGeneration` /
 * `startBatchVideoGeneration`。
 *
 * 逐条对齐 L 的语义：
 * - 只处理还没有成品的分镜（L: `boards.filter((sb) => !hasSbImage(sb))`），
 *   已有成品直接跳过，不重复提交、不重复扣费；
 * - 并发固定为 L 的 pipeline 并发模型（默认 3），用工作者从共享队列取任务；
 * - 停止是协作式的：只在取下一条前检查，不中断已提交的上游任务
 *   （L 也是这样，上游任务已经花掉的额度不会因为点停止而退回）；
 * - 失败按 L 的 `#序号: 原因` 收集，不打断其余分镜。
 */
export async function runBatchMedia(shots: DramaShot[], kind: BatchMediaKind, deps: BatchMediaDeps): Promise<BatchMediaResult> {
    const todo = shots.filter((shot) => !shotHasMedia(shot, kind));
    const total = todo.length;
    if (!total) return { total: 0, completed: 0, failed: 0, errors: [], stopped: false };

    const wait = deps.wait || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const now = deps.now || (() => Date.now());
    const pollInterval = deps.pollIntervalMs ?? BATCH_MEDIA_POLL_INTERVAL_MS;
    const timeoutMs = deps.timeoutMs ?? BATCH_MEDIA_TIMEOUT_MS;
    const concurrency = Math.max(1, Math.min(deps.concurrency ?? BATCH_MEDIA_CONCURRENCY, total));

    const errors: string[] = [];
    let cursor = 0;
    let done = 0;
    let failed = 0;
    let stopped = false;

    // L 用 storyboard_number 标号；V 的契约里对应字段是 `order`（无 shotNumber）。
    const label = (shot: DramaShot, index: number) => `#${shot.order ?? index + 1}`;

    const worker = async () => {
        while (cursor < total) {
            if (deps.shouldStop()) {
                stopped = true;
                return;
            }
            const index = cursor;
            cursor += 1;
            const shot = todo[index];
            try {
                await deps.submit(shot);
                const deadline = now() + timeoutMs;
                for (;;) {
                    await wait(pollInterval);
                    const latest = await deps.reload();
                    const settled = shotSettleState(
                        latest.find((item) => item.id === shot.id),
                        kind,
                    );
                    if (settled.state === "done") break;
                    if (settled.state === "error") throw new Error(settled.error);
                    if (deps.shouldStop()) {
                        stopped = true;
                        break;
                    }
                    if (now() >= deadline) throw new Error("等待超时，请稍后在分镜卡上查看结果");
                }
            } catch (error) {
                failed += 1;
                errors.push(`${label(shot, index)}: ${error instanceof Error ? error.message : "提交失败"}`);
            }
            done += 1;
            deps.onProgress?.({ current: done, total, failed });
            if (stopped) return;
        }
    };

    await Promise.allSettled(Array.from({ length: concurrency }, () => worker()));
    return { total, completed: done, failed, errors, stopped };
}
