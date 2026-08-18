import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { resolvePracticeModelAccess, type PracticeExecutionProfile, type SystemChannelPurpose } from "@/lib/practice-domain";

export const TRUSTED_PRACTICE_CONTEXT_HEADER = "x-vozeb-pro-practice-context";
const PRACTICE_CONTEXT_SECRET = "__vozebProPracticeContextSecret" as const;

export type GenerationBillingMode = "points" | "none";

export function resolveGenerationExecutionPolicy(input: { executionProfile?: PracticeExecutionProfile; trustedPracticeContext?: boolean; channelPurpose?: SystemChannelPurpose; retryingSameTask?: boolean }) {
    const profile = input.executionProfile === "open-source-practice" ? "open-source-practice" : "production";
    if (profile === "open-source-practice" && input.trustedPracticeContext !== true) throw new Error("练习执行档案只能由受信任的练习服务创建");
    const channelPurpose = input.channelPurpose || (profile === "open-source-practice" ? "open-source-practice" : "production");
    if (!resolvePracticeModelAccess(profile, channelPurpose)) throw new Error("当前渠道用途与任务执行档案不匹配");
    return {
        profile,
        billingMode: (profile === "open-source-practice" ? "none" : "points") as GenerationBillingMode,
        channelPurpose,
        allowPractice: profile === "open-source-practice",
        countsTowardConcurrency: true,
    };
}

export function generationTaskShouldConsumePoints(profile: PracticeExecutionProfile | undefined) {
    return profile !== "open-source-practice";
}

export function hasUntrustedExecutionProfile(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const record = value as Record<string, unknown>;
    if (Object.prototype.hasOwnProperty.call(record, "executionProfile")) return true;
    const context = record.context;
    return Boolean(context && typeof context === "object" && !Array.isArray(context) && Object.prototype.hasOwnProperty.call(context, "executionProfile"));
}

export function trustedPracticeTaskHeaders(userId: string, clientRequestId: string) {
    const user = userId.trim().slice(0, 160);
    const request = clientRequestId.trim().slice(0, 160);
    if (!user || !request) throw new Error("练习任务上下文不完整");
    return { [TRUSTED_PRACTICE_CONTEXT_HEADER]: signPracticeContext(user, request) };
}

export function isTrustedPracticeTaskRequest(request: Request, userId: string, context: unknown) {
    if (!context || typeof context !== "object" || Array.isArray(context)) return false;
    const record = context as Record<string, unknown>;
    if (record.executionProfile !== "open-source-practice") return false;
    const clientRequestId = typeof record.clientRequestId === "string" ? record.clientRequestId.trim().slice(0, 160) : "";
    const received = request.headers.get(TRUSTED_PRACTICE_CONTEXT_HEADER)?.trim() || "";
    if (!clientRequestId || !received) return false;
    const expected = signPracticeContext(userId.trim().slice(0, 160), clientRequestId);
    const receivedBytes = Buffer.from(received);
    const expectedBytes = Buffer.from(expected);
    return receivedBytes.length === expectedBytes.length && timingSafeEqual(receivedBytes, expectedBytes);
}

function signPracticeContext(userId: string, clientRequestId: string) {
    return createHmac("sha256", practiceContextSecret()).update(`vozeb-practice-v1\0${userId}\0${clientRequestId}`).digest("base64url");
}

function practiceContextSecret() {
    const configured = process.env.VOZEB_PRO_ENCRYPTION_KEY?.trim();
    if (configured) return configured;
    const scope = globalThis as typeof globalThis & { __vozebProPracticeContextSecret?: Buffer };
    scope[PRACTICE_CONTEXT_SECRET] ||= randomBytes(32);
    return scope[PRACTICE_CONTEXT_SECRET];
}
