import type { LogicalModelCapability } from "@/lib/auth/store";
import { recordChannelRuntimeFailure, recordChannelRuntimeSuccess } from "./channel-runtime-health";
import { releaseChannelReservations, renewChannelReservations, reserveChannelSlot } from "./channel-concurrency";
import { redactDiagnosticText } from "./media-task-diagnostics";

export type GenerationAttempt = {
    attemptNo: number;
    channelId?: string;
    model: string;
    status: "running" | "succeeded" | "failed";
    startedAt: number;
    completedAt?: number;
    pointsCost?: number;
    billingReceiptId?: string;
    error?: string;
    /** Raw upstream failure for admin diagnostics only; redacted, never returned by public task APIs. */
    upstreamError?: string;
    capability?: LogicalModelCapability;
    reservationId?: string;
};

const UPSTREAM_ERROR_MAX_CHARS = 2000;

export function upstreamErrorDetail(error: unknown) {
    const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
    return raw.trim() ? redactDiagnosticText(raw).slice(0, UPSTREAM_ERROR_MAX_CHARS) : undefined;
}

export function nextGenerationAttemptNo(attempts: GenerationAttempt[] | undefined) {
    return (attempts?.length || 0) + 1;
}

/** One reservation per attempt, so releasing an old attempt can never free a newer one. */
export function generationReservationId(scope: string, ownerId: string, attemptNo: number) {
    return `${scope}:${ownerId}#${attemptNo}`;
}

export function startGenerationAttempt(attempts: GenerationAttempt[] | undefined, input: Pick<GenerationAttempt, "channelId" | "model" | "capability"> & { reservationId?: string }) {
    const { reservationId, ...attemptInput } = input;
    const attempt: GenerationAttempt = { attemptNo: nextGenerationAttemptNo(attempts), ...attemptInput, status: "running", startedAt: Date.now() };
    if (reservationId) attempt.reservationId = reservationId;
    return { attempt, attempts: [...(attempts || []), attempt] };
}

/** `upstreamModel` must be the provider's model name (`config.model`), not the logical model ID. */
export async function reserveGenerationAttemptSlot(input: { capability: LogicalModelCapability; channelId?: string; upstreamModel: string; reservationId: string; concurrencyLimit?: number }) {
    if (!input.channelId || !input.concurrencyLimit) return true;
    return reserveChannelSlot(input.capability, input.channelId, input.upstreamModel, input.reservationId, input.concurrencyLimit);
}

export function finishGenerationAttempt(attempts: GenerationAttempt[], attemptNo: number, patch: Pick<GenerationAttempt, "status"> & Partial<Pick<GenerationAttempt, "completedAt" | "pointsCost" | "billingReceiptId" | "error" | "upstreamError">>) {
    return attempts.map((attempt) => {
        if (attempt.attemptNo !== attemptNo) return attempt;
        const completed = { ...attempt, ...patch, completedAt: patch.completedAt || Date.now() };
        if (attempt.capability && attempt.channelId) {
            if (patch.status === "succeeded") recordChannelRuntimeSuccess(attempt.channelId, attempt.capability, completed.completedAt);
            if (patch.status === "failed") recordChannelRuntimeFailure(attempt.channelId, attempt.capability, patch.error, completed.completedAt);
        }
        if (attempt.status === "running" && attempt.reservationId) void releaseGenerationReservations([attempt.reservationId]);
        return completed;
    });
}

/** Never throws: a failed release is logged and the reservation expires by TTL. */
export async function releaseGenerationReservations(reservationIds: Array<string | undefined>) {
    const ids = reservationIds.filter((id): id is string => Boolean(id));
    if (!ids.length) return;
    try {
        await releaseChannelReservations(ids);
    } catch (error) {
        console.error("Channel reservation release failed", { reservationIds: ids, error });
    }
}

/** Keeps reservations alive while a long task is still being polled. Never throws. */
export async function renewGenerationReservations(attempts: GenerationAttempt[] | undefined) {
    const ids = (attempts || []).filter((attempt) => attempt.status === "running" && attempt.reservationId).map((attempt) => attempt.reservationId as string);
    if (!ids.length) return;
    try {
        await renewChannelReservations(ids);
    } catch (error) {
        console.error("Channel reservation renewal failed", { reservationIds: ids, error });
    }
}
