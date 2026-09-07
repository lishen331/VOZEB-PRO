import { after, NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getAuthSettings, isAuthInputError } from "@/lib/auth/store";
import { generationModelId, toSystemGenerationChannel } from "@/lib/server/generation-channel";
import { hasUntrustedExecutionProfile, hasUntrustedWorkflowContext, isTrustedPracticeTaskRequest, sanitizeGenerationContext } from "@/lib/server/generation-execution-policy";
import { attachPracticeWorkflowToChannel, generationBusinessCode, resolvePracticeLogicalModel, workflowTaskContextForChannel } from "@/lib/server/runninghub-workflow-runtime";
import { resolveProjectExecutionProfile } from "@/lib/server/generation-project-context";
import { runGenerationTaskRecoveryBatch } from "@/lib/server/generation-task-recovery-service";
import { scheduleGenerationTask } from "@/lib/server/generation-task-scheduler";
import { getStoredGenerationTaskByRequest, linkStoredGenerationTask, withGenerationConcurrencyLimit } from "@/lib/server/generation-task-store";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { hasHealthyRuntimeCandidate } from "@/lib/server/channel-runtime-health";
import { checkGenerationRateLimit, rateLimitHeaders } from "@/lib/server/security";
import { validateGenerationContextIpReferences } from "@/lib/server/ip-library-reference-service";
import { resolveSchoolComputeBillingContext } from "@/lib/server/school-compute-billing-context";
import { SchoolServiceError } from "@/lib/server/school-access-service";
import { FeatureModuleDisabledError, featureModuleForGenerationContext, requireFeatureModuleEnabled } from "@/lib/server/feature-module-access";
import { createTextTask, type TextTask, type TextTaskConfig } from "@/lib/server/text-task-store";
import { recordTextTaskLog } from "@/lib/server/text-task-log";
import type { AiTextMessage } from "@/types/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

type CreateTextTaskBody = {
    config?: TextTaskConfig;
    messages?: AiTextMessage[];
    context?: import("@/lib/server/generation-task-types").GenerationTaskContext;
};

export async function POST(request: Request) {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    let body: CreateTextTaskBody;
    try {
        body = await readJsonBody(request);
    } catch (error) {
        if (isAuthInputError(error)) return NextResponse.json({ error: error.message }, { status: error.status });
        throw error;
    }
    try {
        const moduleId = featureModuleForGenerationContext(body.context);
        if (moduleId) await requireFeatureModuleEnabled(moduleId);
    } catch (error) {
        if (error instanceof FeatureModuleDisabledError) return NextResponse.json({ error: error.message }, { status: 403 });
        throw error;
    }
    const requestId = body.context?.clientRequestId?.trim();
    if (requestId) {
        const existing = await getStoredGenerationTaskByRequest<TextTask>("text", currentUser.id, requestId, body.context?.attemptNo);
        if (existing) return NextResponse.json({ task: publicTask(existing) });
    }
    const rate = await checkGenerationRateLimit(currentUser.id, request, "text");
    if (!rate.allowed) return NextResponse.json({ error: "文本生成请求过于频繁，请稍后重试" }, { status: 429, headers: rateLimitHeaders(rate) });
    const settings = await getAuthSettings();
    const response = await withGenerationConcurrencyLimit(currentUser.id, "text", 5 * 60 * 1000, settings.generationConcurrency.text, async () => {
        const trustedPractice = isTrustedPracticeTaskRequest(request, currentUser.id, body.context);
        try {
            await validateGenerationContextIpReferences(currentUser.id, body.context);
        } catch (error) {
            if (error instanceof SchoolServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
            throw error;
        }
        const projectProfile = await resolveProjectExecutionProfile(currentUser.id, body.context || {});
        const practiceRequest = trustedPractice || projectProfile === "open-source-practice";
        if ((hasUntrustedExecutionProfile(body) || hasUntrustedWorkflowContext(body)) && !trustedPractice && !practiceRequest) return NextResponse.json({ error: "工作流执行上下文只能由服务端项目或受信任的练习服务创建" }, { status: 400 });
        const executionProfile = practiceRequest ? "open-source-practice" : "production";
        let trustedContext: import("@/lib/server/generation-task-types").GenerationTaskContext;
        try {
            const clientContext = sanitizeGenerationContext(body.context, trustedPractice);
            if (executionProfile === "open-source-practice" && !clientContext.businessCode) clientContext.businessCode = generationBusinessCode(clientContext.surface as string | undefined, "text");
            const billingContext = await resolveSchoolComputeBillingContext(currentUser.id, { ...clientContext, executionProfile });
            trustedContext = { ...clientContext, executionProfile, ...(billingContext ? { billingContext } : {}) };
        } catch (error) {
            if (error instanceof SchoolServiceError) return NextResponse.json({ error: error.message }, { status: error.status });
            throw error;
        }
        const configs = sanitizeConfigs(body.config, settings, executionProfile, trustedContext);
        const messages = sanitizeMessages(body.messages);
        if (!configs.length || !messages.length) return NextResponse.json({ error: "任务参数不完整" }, { status: 400 });
        const hasHealthy = await hasHealthyRuntimeCandidate(configs, "text");
        if (!hasHealthy) return NextResponse.json({ error: "当前文本模型暂不可用，请切换模型或稍后重试" }, { status: 503 });
        if (executionProfile === "open-source-practice") trustedContext = { ...trustedContext, ...workflowTaskContextForChannel(configs[0], trustedContext.businessCode, trustedContext) };

        const task = await createTextTask({ ...trustedContext, userId: currentUser.id, config: configs[0], candidateConfigs: configs.slice(1), messages });
        await recordTextTaskLog(task, currentUser, "pending").catch((error) => console.warn("Text generation log creation failed", { taskId: task.id, error }));
        await linkStoredGenerationTask("text", task.id, trustedContext);
        const cookie = request.headers.get("cookie") || "";
        const origin = resolveInternalOrigin(new URL(request.url).origin);
        await scheduleGenerationTask("text", task.id, { executionPhase: "created", channelId: task.config.channelId, provider: task.config.advancedConfig?.protocol || task.config.apiFormat, nextPollAt: Date.now(), lastUpstreamStatus: "created" });
        after(() => runGenerationTaskRecoveryBatch({ origin, cookie, limit: 1, taskIds: [task.id] }));
        return NextResponse.json({ task: publicTask(task) });
    });
    return response || NextResponse.json({ error: "当前用户文本任务已达到并发上限" }, { status: 429 });
}

function publicTask(task: TextTask) {
    return { id: task.id, status: task.status, model: generationModelId(task.config), result: task.result, error: task.error };
}

function sanitizeConfigs(
    config: TextTaskConfig | undefined,
    settings: Awaited<ReturnType<typeof getAuthSettings>>,
    executionProfile: "production" | "open-source-practice" = "production",
    context?: import("@/lib/server/generation-task-types").GenerationTaskContext,
): Array<TextTaskConfig & { channelId: string }> {
    const requestedModel = executionProfile === "open-source-practice" ? resolvePracticeLogicalModel(settings, "text", context?.businessCode || "script", config?.model) : config?.model || settings.defaultModels.textModel;
    return resolveLogicalModelCandidates(settings, "text", requestedModel, "", executionProfile)
        .map((resolved) => ({
            ...attachPracticeWorkflowToChannel(toSystemGenerationChannel(resolved), settings, context || {}),
            channelId: resolved.channelId,
            systemPrompt: "",
            executionProfile,
        }))
        .filter((config): config is typeof config & { channelId: string } => typeof config.channelId === "string");
}

function sanitizeMessages(messages?: AiTextMessage[]) {
    if (!Array.isArray(messages)) return [];
    return messages
        .map((message) => ({ role: message.role === "system" || message.role === "assistant" ? message.role : ("user" as const), content: sanitizeContent(message.content) }))
        .filter((message) => (Array.isArray(message.content) ? message.content.length > 0 : Boolean(message.content.trim())))
        .slice(0, 20);
}

function sanitizeContent(content: AiTextMessage["content"]): AiTextMessage["content"] {
    if (!Array.isArray(content)) return String(content || "").slice(0, 20_000);
    return content
        .map((item) => (item.type === "text" ? { type: "text" as const, text: item.text.slice(0, 20_000) } : { type: "image_url" as const, image_url: { url: item.image_url.url } }))
        .filter((item) => (item.type === "text" ? Boolean(item.text.trim()) : Boolean(item.image_url.url)));
}
