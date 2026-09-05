import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PracticeExecutionProfile } from "@/lib/practice-domain";
import type { SchoolComputeBillingContext } from "@/lib/school-compute-domain";

export const SYSTEM_AI_LOGICAL_MODEL_HEADER = "x-vozeb-pro-logical-model";
export const SYSTEM_AI_POINTS_IDEMPOTENCY_HEADER = "x-vozeb-pro-points-idempotency-key";
export const SYSTEM_AI_POINTS_SIGNATURE_HEADER = "x-vozeb-pro-points-signature";
export const SYSTEM_AI_UPSTREAM_MODEL_HEADER = "x-vozeb-pro-upstream-model";
export const SYSTEM_AI_EXECUTION_PROFILE_HEADER = "x-vozeb-pro-execution-profile";
export const SYSTEM_AI_BILLING_CONTEXT_HEADER = "x-vozeb-pro-billing-context";

const SYSTEM_AI_POINTS_SIGNATURE_VERSION = "v1";
const SYSTEM_AI_POINTS_PROCESS_SECRET = "__vozebProSystemAiPointsProcessSecret" as const;

export type SystemAiBilling = {
    pointsCost?: number;
    billingReceiptId?: string;
};

export function systemAiBillingHeaders(logicalModel: string, idempotencyKey?: string, upstreamModel?: string, executionProfile: PracticeExecutionProfile = "production", billingContext?: SchoolComputeBillingContext) {
    const normalizedLogicalModel = logicalModel.trim();
    const normalizedIdempotencyKey = idempotencyKey?.trim();
    const normalizedUpstreamModel = upstreamModel?.trim();
    return {
        ...(normalizedLogicalModel ? { [SYSTEM_AI_LOGICAL_MODEL_HEADER]: normalizedLogicalModel } : {}),
        ...(normalizedIdempotencyKey
            ? {
                  [SYSTEM_AI_POINTS_IDEMPOTENCY_HEADER]: normalizedIdempotencyKey,
                  [SYSTEM_AI_POINTS_SIGNATURE_HEADER]: signSystemAiBusinessRequest(normalizedLogicalModel, normalizedIdempotencyKey, normalizedUpstreamModel || "", executionProfile, billingContext),
              }
            : {}),
        ...(normalizedUpstreamModel ? { [SYSTEM_AI_UPSTREAM_MODEL_HEADER]: normalizedUpstreamModel } : {}),
        ...(executionProfile === "open-source-practice" ? { [SYSTEM_AI_EXECUTION_PROFILE_HEADER]: executionProfile } : {}),
        ...(billingContext ? { [SYSTEM_AI_BILLING_CONTEXT_HEADER]: serializeBillingContext(billingContext) } : {}),
    };
}

export function readVerifiedSystemAiBusinessRequest(headers: Headers, logicalModel: string, upstreamModel: string, executionProfile?: PracticeExecutionProfile) {
    const businessRequestId = headers.get(SYSTEM_AI_POINTS_IDEMPOTENCY_HEADER)?.trim().slice(0, 200) || "";
    const signature = headers.get(SYSTEM_AI_POINTS_SIGNATURE_HEADER)?.trim() || "";
    if (!businessRequestId || !signature) return undefined;
    const headerProfile = headers.get(SYSTEM_AI_EXECUTION_PROFILE_HEADER)?.trim() || "production";
    if (headerProfile !== "production" && headerProfile !== "open-source-practice") return undefined;
    if (executionProfile && headerProfile !== executionProfile) return undefined;
    const requestedProfile = executionProfile || headerProfile;
    const rawBillingContext = headers.get(SYSTEM_AI_BILLING_CONTEXT_HEADER);
    const billingContext = parseBillingContext(rawBillingContext);
    if (rawBillingContext && !billingContext) return undefined;
    const expected = signSystemAiBusinessRequest(logicalModel.trim(), businessRequestId, upstreamModel.trim(), requestedProfile, billingContext);
    const receivedBytes = Buffer.from(signature);
    const expectedBytes = Buffer.from(expected);
    if (receivedBytes.length !== expectedBytes.length || !timingSafeEqual(receivedBytes, expectedBytes)) return undefined;
    return { businessRequestId, billingContext };
}

export function readVerifiedSystemAiBusinessRequestId(headers: Headers, logicalModel: string, upstreamModel: string, executionProfile?: PracticeExecutionProfile) {
    return readVerifiedSystemAiBusinessRequest(headers, logicalModel, upstreamModel, executionProfile)?.businessRequestId;
}

export function systemAiPointsIdempotencyKey(input: { userId: string; businessRequestId: string; logicalModel: string; channelId: string; upstreamModel: string; callType: string }) {
    return `system-ai:${stableDigest([input.userId, input.businessRequestId, input.logicalModel, input.channelId, input.upstreamModel, input.callType])}`;
}

export function systemAiRequestFingerprint(input: { method: string; callType: string; logicalModel: string; channelId: string; upstreamModel: string; usageKind: string; amount: number; bodyDigest: string }) {
    return stableDigest([input.method.toUpperCase(), input.callType, input.logicalModel, input.channelId, input.upstreamModel, input.usageKind, String(input.amount), input.bodyDigest]);
}

export function systemAiIdempotencyKey(scope: string, ...parts: string[]) {
    const prefix =
        scope
            .trim()
            .replace(/[^a-zA-Z0-9._-]+/g, "-")
            .slice(0, 40) || "system-ai";
    const digest = createHash("sha256").update(parts.join("\0")).digest("hex").slice(0, 32);
    return `${prefix}:${digest}`;
}

function signSystemAiBusinessRequest(logicalModel: string, businessRequestId: string, upstreamModel: string, executionProfile: PracticeExecutionProfile = "production", billingContext?: SchoolComputeBillingContext) {
    return createHmac("sha256", systemAiPointsSigningSecret())
        .update([SYSTEM_AI_POINTS_SIGNATURE_VERSION, normalizeBillingModel(logicalModel), businessRequestId, normalizeBillingModel(upstreamModel), executionProfile, billingContext ? serializeBillingContext(billingContext) : ""].join("\0"))
        .digest("base64url");
}

function serializeBillingContext(context: SchoolComputeBillingContext) {
    return JSON.stringify({ schoolId: context.schoolId.trim(), groupId: context.groupId.trim(), orderId: context.orderId.trim(), projectType: context.projectType, projectId: context.projectId.trim() });
}

function parseBillingContext(value: string | null): SchoolComputeBillingContext | undefined {
    if (!value) return undefined;
    try {
        const parsed = JSON.parse(value) as Partial<SchoolComputeBillingContext>;
        if (!parsed.schoolId || !parsed.groupId || !parsed.orderId || !parsed.projectId || (parsed.projectType !== "canvas" && parsed.projectType !== "drama")) return undefined;
        return { schoolId: parsed.schoolId, groupId: parsed.groupId, orderId: parsed.orderId, projectType: parsed.projectType, projectId: parsed.projectId };
    } catch {
        return undefined;
    }
}

function stableDigest(parts: string[]) {
    return createHash("sha256").update(parts.join("\0")).digest("hex");
}

function normalizeBillingModel(value: string) {
    return value
        .trim()
        .replace(/^models\//i, "")
        .toLowerCase();
}

function systemAiPointsSigningSecret() {
    const configured = process.env.VOZEB_PRO_ENCRYPTION_KEY?.trim();
    if (configured) return configured;
    const scope = globalThis as typeof globalThis & { __vozebProSystemAiPointsProcessSecret?: Buffer };
    scope[SYSTEM_AI_POINTS_PROCESS_SECRET] ||= randomBytes(32);
    return scope[SYSTEM_AI_POINTS_PROCESS_SECRET];
}

export function readSystemAiBilling(headers: Headers): SystemAiBilling {
    const rawCost = headers.get("x-vozeb-pro-points-cost");
    const cost = rawCost === null ? undefined : Number(rawCost);
    return {
        pointsCost: cost !== undefined && Number.isFinite(cost) && cost >= 0 ? cost : undefined,
        billingReceiptId: headers.get("x-vozeb-pro-billing-receipt-id") || undefined,
    };
}

export function hasSystemAiCharge(billing: SystemAiBilling): billing is Required<SystemAiBilling> {
    return billing.pointsCost !== undefined && Boolean(billing.billingReceiptId);
}
