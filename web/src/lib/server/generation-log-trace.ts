import { createPostgresRepositories } from "@/lib/server/database";
import { sanitizeDiagnosticEvent, type MediaDiagnosticEvent } from "@/lib/server/media-task-diagnostics";

export type GenerationLogTraceStep = {
    at: number;
    phase: string;
    model?: string;
    channelId?: string;
    channelName?: string;
    status?: number;
    durationMs?: number;
    errorMessage?: string;
    errorName?: string;
    errorCode?: string;
    requestId?: string;
    url?: string;
    state?: string;
    attemptNo?: number;
};

export type GenerationLogTrace = {
    taskId: string;
    executionProfile: "production" | "open-source-practice";
    channelName?: string;
    diagnosticsExpired: boolean;
    steps: GenerationLogTraceStep[];
};

const TRACE_FIELDS = ["model", "channelId", "errorMessage", "errorName", "errorCode", "requestId", "url", "state"] as const;

/** Admin-only read of one log's diagnostic timeline. The route id is the log id, never the task id. Sanitizes on the way out; never reaches user-facing APIs. */
export async function readGenerationLogTrace(logId: string): Promise<GenerationLogTrace | null> {
    const id = logId.trim();
    if (!id) return null;
    const repository = createPostgresRepositories();
    const log = await repository.generationLogs.getById(id);
    const taskId = log?.taskId?.trim();
    if (!taskId) return null;
    const trace = await repository.generationLogs.getTaskTrace(taskId);
    if (!trace) return null;
    const events = trace.events.flatMap((event) => {
        if (!event || typeof event !== "object") return [];
        const record = event as Record<string, unknown>;
        const at = typeof record.at === "number" && Number.isFinite(record.at) ? record.at : undefined;
        return [sanitizeDiagnosticEvent(record, at)];
    });
    const channelIds = [trace.channelId, ...events.map((event) => stringField(event, "channelId"))].filter((value): value is string => Boolean(value));
    const channelNames = await repository.generationLogs.getChannelNames(channelIds);
    return {
        taskId,
        executionProfile: trace.executionProfile,
        channelName: trace.channelId ? channelNames.get(trace.channelId) : undefined,
        diagnosticsExpired: trace.diagnosticsExpired,
        steps: events.map((event) => toTraceStep(event, channelNames)),
    };
}

function toTraceStep(event: MediaDiagnosticEvent, channelNames: Map<string, string>): GenerationLogTraceStep {
    const step: GenerationLogTraceStep = { at: event.at, phase: event.phase };
    for (const field of TRACE_FIELDS) {
        const value = stringField(event, field);
        if (value) step[field] = value;
    }
    if (typeof event.status === "number") step.status = event.status;
    if (typeof event.durationMs === "number") step.durationMs = event.durationMs;
    if (typeof event.attemptNo === "number") step.attemptNo = event.attemptNo;
    const channelId = stringField(event, "channelId");
    if (channelId && channelNames.has(channelId)) step.channelName = channelNames.get(channelId);
    return step;
}

function stringField(event: MediaDiagnosticEvent, field: (typeof TRACE_FIELDS)[number]) {
    const value = event[field];
    return typeof value === "string" && value.trim() ? value : undefined;
}
