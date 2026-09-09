import type { GenerationTaskExecutionPhase } from "@/lib/server/generation-task-scheduler";
import type { PracticeExecutionProfile } from "@/lib/practice-domain";
import type { IpReference } from "@/lib/ip-library-domain";
import type { SchoolComputeBillingContext } from "@/lib/school-compute-domain";
import type { RunningHubWorkflowBusinessCode } from "@/lib/auth/store-types";

export type GenerationTaskType = "text" | "image" | "video" | "audio" | "agent" | "render";
export type GenerationTaskStatus = "pending" | "running" | "success" | "error" | "paused" | "cancelled";

export type StoredTaskBilling = {
    pointsCost: number;
    billingReceiptId: string;
    refunded: boolean;
};

export type GenerationTaskContext = {
    conversationId?: string;
    runId?: string;
    surface?: "chat" | "canvas" | "drama";
    featureModule?: "drama-lab";
    executionProfile?: PracticeExecutionProfile;
    projectId?: string;
    episodeId?: string;
    shotId?: string;
    /** Drama Lab frame slot associated with an image task. */
    frameType?: "first" | "key" | "last";
    estimatedPoints?: number;
    parentTaskId?: string;
    attemptNo?: number;
    clientRequestId?: string;
    generationLogId?: string;
    generationSlotId?: string;
    ipReferences?: IpReference[];
    billingContext?: SchoolComputeBillingContext;
    /** Optional short-lived, non-secret input snapshot for domain recovery/audit. */
    frameSnapshot?: Record<string, unknown>;
    /** Short-drama audio track context; kept on the shared task for recovery. */
    audioKind?: "dialogue" | "narration";
    speaker?: string;
    workflowKey?: string;
    workflowVersion?: number;
    upstreamWorkflowId?: string;
    workflowConfigFingerprint?: string;
    workflowCode?: string;
    workflowAdapterVersion?: number;
    businessCode?: RunningHubWorkflowBusinessCode;
    taskOrigin?: "user" | "admin-workflow-test";
};

export type StoredGenerationTaskRecord = {
    id: string;
    userId: string;
    type: GenerationTaskType;
    status: GenerationTaskStatus;
    payload: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
    expiresAt: number;
    executionPhase?: GenerationTaskExecutionPhase;
    upstreamTaskId?: string;
    channelId?: string;
    provider?: string;
    queryPath?: string;
    submittedAt?: number;
    nextPollAt?: number;
    lastPollAt?: number;
    lastUpstreamStatus?: string;
    resultPayload?: Record<string, unknown>;
    reviewReason?: string;
    workerId?: string;
    leaseUntil?: number;
    lastHeartbeatAt?: number;
} & GenerationTaskContext;

export type GenerationTaskRecordListOptions = {
    page?: number;
    pageSize?: number;
    type?: string;
    status?: string;
    surface?: string;
    projectId?: string;
    userId?: string;
    search?: string;
    searchUserIds?: string[];
    includeAll?: boolean;
};

export type GenerationTaskRecordSummary = {
    total: number;
    active: number;
    success: number;
    failed: number;
    averageDurationMs: number;
    totalPointsCost: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
};

export type GenerationTaskCostAggregate = {
    type: GenerationTaskType;
    status: GenerationTaskStatus;
    taskCount: number;
    estimatedPoints: number;
    actualPoints: number;
};

export type GenerationTaskPerformanceSummary = {
    sampleSize: number;
    planningP50Ms: number;
    planningP95Ms: number;
    firstResultP50Ms: number;
    firstResultP95Ms: number;
    queueAverageMs: number;
    upstreamAverageMs: number;
    reviewAverageMs: number;
};

export type GenerationTaskExecutionState = Pick<StoredGenerationTaskRecord, "executionPhase" | "lastUpstreamStatus" | "reviewReason">;
