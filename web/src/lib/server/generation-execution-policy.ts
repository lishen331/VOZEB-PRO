import { resolvePracticeModelAccess, type PracticeExecutionProfile, type SystemChannelPurpose } from "@/lib/practice-domain";

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
