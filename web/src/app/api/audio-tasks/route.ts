import { after, NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getAuthSettings, isAuthInputError } from "@/lib/auth/store";
import { mediaTaskSource } from "@/lib/media-management-contract";
import { resolveAudioTaskOptions } from "@/lib/server/audio-task-config";
import { createAudioTask, type AudioTask, type AudioTaskConfig } from "@/lib/server/audio-task-store";
import { generationModelId, toSystemGenerationChannel } from "@/lib/server/generation-channel";
import { runGenerationTaskRecoveryBatch } from "@/lib/server/generation-task-recovery-service";
import { scheduleGenerationTask } from "@/lib/server/generation-task-scheduler";
import { getStoredGenerationTaskByRequest, linkStoredGenerationTask, withGenerationConcurrencyLimit, type GenerationTaskContext } from "@/lib/server/generation-task-store";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { hasHealthyRuntimeCandidate } from "@/lib/server/channel-runtime-health";
import { checkGenerationRateLimit, rateLimitHeaders } from "@/lib/server/security";
import { hasUntrustedExecutionProfile, hasUntrustedWorkflowContext, isTrustedPracticeTaskRequest, sanitizeGenerationContext } from "@/lib/server/generation-execution-policy";
import { validateGenerationContextIpReferences } from "@/lib/server/ip-library-reference-service";
import { resolveSchoolComputeBillingContext } from "@/lib/server/school-compute-billing-context";
import { SchoolServiceError } from "@/lib/server/school-access-service";
import { attachPracticeWorkflowToChannel, generationBusinessCode, resolvePracticeLogicalModel, workflowTaskContextForChannel } from "@/lib/server/runninghub-workflow-runtime";
import { resolveProjectExecutionProfile } from "@/lib/server/generation-project-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

export async function POST(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    const rate = await checkGenerationRateLimit(user.id, request, "audio");
    if (!rate.allowed) return NextResponse.json({ error: "音频生成请求过于频繁，请稍后重试" }, { status: 429, headers: rateLimitHeaders(rate) });
    const settings = await getAuthSettings();
    const response = await withGenerationConcurrencyLimit(user.id, "audio", 10 * 60 * 1000, settings.generationConcurrency.audio, async () => {
        let body: { config?: AudioTaskConfig; prompt?: string; input?: Record<string, unknown>; source?: string; context?: GenerationTaskContext };
        try {
            body = await readJsonBody(request);
        } catch (error) {
            if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
            throw error;
        }
        const trustedPractice = isTrustedPracticeTaskRequest(request, user.id, body.context);
        const requestId = body.context?.clientRequestId?.trim();
        if (requestId) {
            const existing = await getStoredGenerationTaskByRequest<AudioTask>("audio", user.id, requestId, body.context?.attemptNo);
            if (existing) return NextResponse.json({ task: publicTask(existing) });
        }
        try {
            await validateGenerationContextIpReferences(user.id, body.context);
        } catch (error) {
            if (error instanceof SchoolServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
            throw error;
        }
        const projectProfile = await resolveProjectExecutionProfile(user.id, body.context || {});
        const practiceRequest = trustedPractice || projectProfile === "open-source-practice";
        if ((hasUntrustedExecutionProfile(body) || hasUntrustedWorkflowContext(body)) && !trustedPractice && !practiceRequest) return NextResponse.json({ error: "工作流执行上下文只能由服务端项目或受信任的练习服务创建" }, { status: 400 });
        const executionProfile: "production" | "open-source-practice" = practiceRequest ? "open-source-practice" : "production";
        let trustedContext: GenerationTaskContext;
        try {
            const clientContext = sanitizeGenerationContext(body.context, trustedPractice);
            if (executionProfile === "open-source-practice" && !clientContext.businessCode) clientContext.businessCode = generationBusinessCode(clientContext.surface as string | undefined, "audio");
            const billingContext = await resolveSchoolComputeBillingContext(user.id, { ...clientContext, executionProfile });
            trustedContext = { ...clientContext, executionProfile, ...(billingContext ? { billingContext } : {}) };
        } catch (error) {
            if (error instanceof SchoolServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
            throw error;
        }
        const channels = resolveLogicalModelCandidates(
            settings,
            "audio",
            practiceRequest ? resolvePracticeLogicalModel(settings, "audio", trustedContext.businessCode || "dubbing", body.config?.model) : body.config?.model || settings.defaultModels.audioModel,
            "",
            executionProfile,
        ).map((resolved) => ({
            ...attachPracticeWorkflowToChannel(toSystemGenerationChannel(resolved), settings, trustedContext),
            channelId: resolved.channelId,
            executionProfile,
        }));
        const prompt = String(body.prompt || "").trim();
        const supportedChannels = channels.filter((channel): channel is typeof channel & { channelId: string } => channel.apiFormat !== "gemini" && typeof channel.channelId === "string");
        if (!supportedChannels.length || !prompt) return NextResponse.json({ error: "音频任务参数不完整或渠道不支持" }, { status: 400 });
        const hasHealthy = await hasHealthyRuntimeCandidate(supportedChannels, "audio");
        if (!hasHealthy) return NextResponse.json({ error: "当前音频模型暂不可用，请切换模型或稍后重试" }, { status: 503 });
        const configs: AudioTaskConfig[] = supportedChannels.map((channel) => ({ ...channel, ...resolveAudioTaskOptions(body.config, settings.generationDefaults), instructions: clean(body.config?.instructions, 2_000) }));
        if (executionProfile === "open-source-practice") trustedContext = { ...trustedContext, ...workflowTaskContextForChannel(configs[0], trustedContext.businessCode, trustedContext) };
        const task = await createAudioTask({ ...trustedContext, userId: user.id, config: configs[0], candidateConfigs: configs.slice(1), prompt: prompt.slice(0, 20_000), workflowInput: body.input, source: mediaTaskSource(body.source, trustedContext, "audio-task") });
        await linkStoredGenerationTask("audio", task.id, trustedContext);
        const origin = resolveInternalOrigin(new URL(request.url).origin);
        const cookie = request.headers.get("cookie") || "";
        await scheduleGenerationTask("audio", task.id, { executionPhase: "created", channelId: task.config.channelId, provider: task.config.advancedConfig?.protocol || task.config.apiFormat, nextPollAt: Date.now(), lastUpstreamStatus: "created" });
        after(() => runGenerationTaskRecoveryBatch({ origin, cookie, limit: 1, taskIds: [task.id] }));
        return NextResponse.json({ task: publicTask(task) });
    });
    return response || NextResponse.json({ error: "当前用户音频任务已达到并发上限" }, { status: 429 });
}

function publicTask(task: AudioTask) {
    return { id: task.id, status: task.status, model: generationModelId(task.config), result: task.result, error: task.error };
}

function clean(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
