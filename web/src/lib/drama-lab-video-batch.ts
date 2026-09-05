import type { DramaTaskStatus } from "@/lib/drama-project-contract";

export type DramaLabVideoBatchExecutionPhase = "created" | "submitting" | "submitted" | "polling" | "result_ready" | "persisting" | "cancel_requested" | "cancel_polling" | "needs_review" | "completed";

export type DramaLabVideoBatchTarget = {
    shotId: string;
    taskId: string;
};

export type DramaLabVideoBatchObservation = DramaLabVideoBatchTarget & {
    status: DramaTaskStatus;
    executionPhase?: DramaLabVideoBatchExecutionPhase;
    needsReview?: boolean;
    videoUrl?: string;
    error?: string;
};

export type DramaLabVideoBatchOutcome = "success" | "failed" | "cancelled" | "needs_review";

export type DramaLabVideoBatchItem = DramaLabVideoBatchTarget & {
    outcome: DramaLabVideoBatchOutcome | "pending";
    status?: DramaTaskStatus;
    executionPhase?: DramaLabVideoBatchExecutionPhase;
    videoUrl?: string;
    error?: string;
};

export type DramaLabVideoBatchSummary = {
    totalCount: number;
    terminalCount: number;
    pendingCount: number;
    submittedCount: number;
    resultReadyCount: number;
    successCount: number;
    failedCount: number;
    cancelledCount: number;
    needsReviewCount: number;
    allSucceeded: boolean;
    items: DramaLabVideoBatchItem[];
};

export type WaitForDramaLabVideoBatchInput = {
    targets: DramaLabVideoBatchTarget[];
    /** Submission failures that have no server task to poll. */
    initialFailures?: ReadonlyArray<{ shotId: string; error?: string }>;
    read: (target: DramaLabVideoBatchTarget, context: { round: number; signal?: AbortSignal }) => Promise<DramaLabVideoBatchObservation>;
    intervalMs?: number;
    maxPollRounds?: number;
    signal?: AbortSignal;
    sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>;
    onProgress?: (summary: DramaLabVideoBatchSummary) => void | Promise<void>;
};

export class DramaLabVideoBatchWaitError extends Error {
    constructor(
        message: string,
        readonly reason: "aborted" | "poll_limit_reached",
        readonly progress: DramaLabVideoBatchSummary,
    ) {
        super(message);
        this.name = "DramaLabVideoBatchWaitError";
    }
}

const NON_TERMINAL_PHASES = new Set<DramaLabVideoBatchExecutionPhase>(["created", "submitting", "submitted", "polling", "result_ready", "persisting", "cancel_requested", "cancel_polling"]);

export function classifyDramaLabVideoBatchObservation(target: DramaLabVideoBatchTarget, observation: DramaLabVideoBatchObservation): Omit<DramaLabVideoBatchItem, "shotId" | "taskId"> | null {
    const expectedShotId = target.shotId.trim();
    const expectedTaskId = target.taskId.trim();
    const observedShotId = typeof observation.shotId === "string" ? observation.shotId.trim() : "";
    const observedTaskId = typeof observation.taskId === "string" ? observation.taskId.trim() : "";
    if (observedShotId !== expectedShotId || observedTaskId !== expectedTaskId) {
        return {
            outcome: "failed",
            status: observation.status,
            executionPhase: observation.executionPhase,
            error: "The shot is no longer bound to the submitted video task.",
        };
    }
    if (observation.status === "cancelled") {
        // Cancellation is only terminal after the provider cancellation has
        // settled. During cancel_requested/cancel_polling the child remains
        // pending so a batch cannot report completion too early.
        if (observation.executionPhase === "cancel_requested" || observation.executionPhase === "cancel_polling") return null;
        return observationItem("cancelled", observation, observation.error);
    }
    if (observation.needsReview || observation.executionPhase === "needs_review") {
        return observationItem("needs_review", observation, observation.error || "The original upstream video task requires review.");
    }
    if (observation.status === "error") return observationItem("failed", observation, observation.error || "Video generation failed.");

    // submitted/polling means the provider is still working. result_ready and
    // persisting are also non-terminal because the playable media has not yet
    // been durably attached to the shot.
    if (observation.executionPhase && NON_TERMINAL_PHASES.has(observation.executionPhase)) return null;

    if (observation.status === "success") {
        const videoUrl = observation.videoUrl?.trim();
        return videoUrl ? observationItem("success", { ...observation, videoUrl }) : observationItem("failed", observation, observation.error || "The video task completed without a playable URL.");
    }
    if (observation.executionPhase === "completed") {
        return observationItem("failed", observation, observation.error || "The video task completed without a terminal shot result.");
    }
    return null;
}

export function isDramaLabVideoBatchObservationTerminal(target: DramaLabVideoBatchTarget, observation: DramaLabVideoBatchObservation) {
    return classifyDramaLabVideoBatchObservation(target, observation) !== null;
}

export async function waitForDramaLabVideoBatch(input: WaitForDramaLabVideoBatchInput): Promise<DramaLabVideoBatchSummary> {
    const targets = normalizeTargets(input.targets);
    const initialFailures = normalizeInitialFailures(input.initialFailures);
    const targetShotIds = new Set(targets.map((target) => target.shotId));
    for (const failure of initialFailures) {
        if (targetShotIds.has(failure.shotId)) throw new Error(`Shot ${failure.shotId} cannot be both submitted and failed during video batch creation.`);
    }
    const observations = new Map<string, DramaLabVideoBatchObservation>();
    const terminal = new Map<string, DramaLabVideoBatchItem>();
    const intervalMs = boundedInterval(input.intervalMs);
    const maxPollRounds = boundedPollRounds(input.maxPollRounds);
    const sleep = input.sleep || defaultSleep;

    let summary = buildSummary(targets, observations, terminal, initialFailures);
    if (!targets.length) return summary;

    for (let round = 1; terminal.size < targets.length; round += 1) {
        assertCanContinue(input.signal, summary);
        const pending = targets.filter((target) => !terminal.has(targetKey(target)));
        let current: DramaLabVideoBatchObservation[];
        try {
            current = await Promise.all(pending.map((target) => input.read(target, { round, signal: input.signal })));
        } catch (error) {
            // A caller may abort while a read is in flight. Preserve the
            // partial summary and use the domain error so the UI cannot
            // mistake an interrupted batch for a successful one.
            if (input.signal?.aborted) {
                throw new DramaLabVideoBatchWaitError("Video batch waiting was aborted.", "aborted", summary);
            }
            throw error;
        }
        assertCanContinue(input.signal, summary);

        current.forEach((observation, index) => {
            const target = pending[index];
            observations.set(targetKey(target), observation);
            const outcome = classifyDramaLabVideoBatchObservation(target, observation);
            if (outcome) terminal.set(targetKey(target), { shotId: target.shotId, taskId: target.taskId, ...outcome });
        });

        summary = buildSummary(targets, observations, terminal, initialFailures);
        await input.onProgress?.(summary);
        assertCanContinue(input.signal, summary);
        if (!summary.pendingCount) return summary;
        if (round >= maxPollRounds) throw new DramaLabVideoBatchWaitError("Video batch polling stopped before every child task reached a terminal state.", "poll_limit_reached", summary);

        assertCanContinue(input.signal, summary);
        try {
            await sleep(intervalMs, input.signal);
        } catch (error) {
            if (input.signal?.aborted) throw new DramaLabVideoBatchWaitError("Video batch waiting was aborted.", "aborted", summary);
            throw error;
        }
    }
    return summary;
}

function observationItem(outcome: DramaLabVideoBatchOutcome, observation: DramaLabVideoBatchObservation, error?: string): Omit<DramaLabVideoBatchItem, "shotId" | "taskId"> {
    return {
        outcome,
        status: observation.status,
        executionPhase: observation.executionPhase,
        videoUrl: observation.videoUrl?.trim() || undefined,
        error: error?.trim() || undefined,
    };
}

function buildSummary(targets: DramaLabVideoBatchTarget[], observations: Map<string, DramaLabVideoBatchObservation>, terminal: Map<string, DramaLabVideoBatchItem>, initialFailures: readonly DramaLabVideoBatchItem[] = []): DramaLabVideoBatchSummary {
    const items = [
        ...initialFailures,
        ...targets.map((target): DramaLabVideoBatchItem => {
            const key = targetKey(target);
            const settled = terminal.get(key);
            if (settled) return settled;
            const observation = observations.get(key);
            return {
                shotId: target.shotId,
                taskId: target.taskId,
                outcome: "pending",
                status: observation?.status,
                executionPhase: observation?.executionPhase,
                videoUrl: observation?.videoUrl?.trim() || undefined,
                error: observation?.error?.trim() || undefined,
            };
        }),
    ];
    return summarizeDramaLabVideoBatch(items);
}

export function summarizeDramaLabVideoBatch(items: readonly DramaLabVideoBatchItem[]): DramaLabVideoBatchSummary {
    const terminalCount = items.filter((item) => item.outcome !== "pending").length;
    const pendingItems = items.filter((item) => item.outcome === "pending");
    return {
        totalCount: items.length,
        terminalCount,
        pendingCount: items.length - terminalCount,
        submittedCount: pendingItems.filter((item) => item.executionPhase === "created" || item.executionPhase === "submitting" || item.executionPhase === "submitted").length,
        resultReadyCount: pendingItems.filter((item) => item.executionPhase === "result_ready" || item.executionPhase === "persisting").length,
        successCount: items.filter((item) => item.outcome === "success").length,
        failedCount: items.filter((item) => item.outcome === "failed").length,
        cancelledCount: items.filter((item) => item.outcome === "cancelled").length,
        needsReviewCount: items.filter((item) => item.outcome === "needs_review").length,
        allSucceeded: Boolean(items.length) && items.every((item) => item.outcome === "success"),
        items: items.map((item) => ({ ...item })),
    };
}

function normalizeTargets(input: DramaLabVideoBatchTarget[]) {
    const byShot = new Map<string, DramaLabVideoBatchTarget>();
    const byTask = new Map<string, string>();
    for (const item of input) {
        const target = { shotId: item.shotId.trim(), taskId: item.taskId.trim() };
        if (!target.shotId || !target.taskId) throw new Error("Video batch targets require both shotId and taskId.");
        const existingShot = byShot.get(target.shotId);
        if (existingShot && existingShot.taskId !== target.taskId) throw new Error(`Shot ${target.shotId} has more than one video task in the same batch.`);
        const existingTaskShot = byTask.get(target.taskId);
        if (existingTaskShot && existingTaskShot !== target.shotId) throw new Error(`Video task ${target.taskId} is bound to more than one shot in the same batch.`);
        if (!existingShot) byShot.set(target.shotId, target);
        byTask.set(target.taskId, target.shotId);
    }
    return [...byShot.values()];
}

function normalizeInitialFailures(input: WaitForDramaLabVideoBatchInput["initialFailures"]): DramaLabVideoBatchItem[] {
    if (!input?.length) return [];
    const seen = new Set<string>();
    return input.map((item) => {
        const shotId = typeof item.shotId === "string" ? item.shotId.trim() : "";
        if (!shotId) throw new Error("Initial video batch failures require a shotId.");
        if (seen.has(shotId)) throw new Error(`Shot ${shotId} has more than one initial video batch failure.`);
        seen.add(shotId);
        return {
            shotId,
            taskId: `submission:${shotId}`,
            outcome: "failed" as const,
            status: "error" as const,
            executionPhase: "completed" as const,
            error: item.error?.trim() || "Video task submission failed.",
        };
    });
}

function targetKey(target: DramaLabVideoBatchTarget) {
    return `${target.shotId}\0${target.taskId}`;
}

function boundedInterval(value: number | undefined) {
    const interval = Number(value);
    return Number.isFinite(interval) && interval >= 0 ? Math.floor(interval) : 2_500;
}

function boundedPollRounds(value: number | undefined) {
    if (value === undefined) return Number.POSITIVE_INFINITY;
    const rounds = Number(value);
    if (!Number.isSafeInteger(rounds) || rounds < 1) throw new Error("maxPollRounds must be a positive safe integer.");
    return rounds;
}

function assertCanContinue(signal: AbortSignal | undefined, summary: DramaLabVideoBatchSummary) {
    if (signal?.aborted) throw new DramaLabVideoBatchWaitError("Video batch waiting was aborted.", "aborted", summary);
}

function defaultSleep(milliseconds: number, signal?: AbortSignal) {
    return new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
            reject(new Error("Aborted"));
            return;
        }
        const timeout = setTimeout(finish, milliseconds);
        signal?.addEventListener("abort", abort, { once: true });

        function finish() {
            signal?.removeEventListener("abort", abort);
            resolve();
        }
        function abort() {
            clearTimeout(timeout);
            reject(new Error("Aborted"));
        }
    });
}
