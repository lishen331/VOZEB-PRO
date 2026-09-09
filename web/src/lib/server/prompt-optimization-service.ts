import { getAuthSettings } from "@/lib/auth/store";
import { CREATE_AGENT_PROMPT_MAX_LENGTH } from "@/lib/create-agent-prompt";
import type { CreativeGenerationMode } from "@/lib/creative-runtime-contract";
import { toSafeGenerationErrorMessage } from "@/lib/server/generation-errors";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { hasSystemAiCharge, readSystemAiBilling, systemAiBillingHeaders, systemAiIdempotencyKey } from "@/lib/server/system-ai-billing";
import { rankTextPlanningCandidates, requestStructuredText } from "@/lib/server/text-planning-runtime";
import { refundGenerationCharge } from "@/lib/server/generation-charge-service";
import { resolveSiteTitle } from "@/lib/site-brand";

type PromptOptimizationMode = "agent" | CreativeGenerationMode;

export class PromptOptimizationError extends Error {
    constructor(
        message: string,
        readonly status = 502,
    ) {
        super(message);
        this.name = "PromptOptimizationError";
    }
}

export async function optimizeCreativePrompt(input: { origin: string; cookie: string; userId: string; requestId: string; prompt: string; mode: PromptOptimizationMode }) {
    const settings = await getAuthSettings();
    // 优先使用正式生产默认文本模型；没有时回退到无限练习默认文本模型（练习环境常常只配置了练习渠道）
    const resolved = [
        { model: settings.defaultModels.textModel, profile: "production" as const },
        { model: settings.practiceDefaultModels?.textModel, profile: "open-source-practice" as const },
    ]
        .filter((item) => Boolean(item.model))
        .map((item) => ({ model: item.model as string, candidates: resolveLogicalModelCandidates(settings, "text", item.model as string, "", item.profile) }))
        .find((item) => item.candidates.length);
    if (!resolved) throw new PromptOptimizationError("后台尚未配置可用的默认文本模型（正式生产或无限练习）", 503);
    const { model, candidates } = resolved;

    const rankedCandidates = rankTextPlanningCandidates(candidates);
    if (!rankedCandidates.length) throw new PromptOptimizationError("当前没有可用的文本模型渠道，请检查模型配置或稍后重试", 503);

    let latestError: unknown;
    for (const candidate of rankedCandidates) {
        const idempotencyKey = systemAiIdempotencyKey("prompt-optimize", input.userId, input.requestId, candidate.channelId, candidate.upstreamModel);
        try {
            const call = await requestStructuredText({
                origin: input.origin,
                cookie: input.cookie,
                candidate,
                messages: [
                    { role: "system", content: promptOptimizationInstruction(input.mode, settings.site.title) },
                    { role: "user", content: input.prompt },
                ],
                tool: promptOptimizationTool,
                headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": idempotencyKey,
                    "X-Client-Request-Id": idempotencyKey,
                    ...systemAiBillingHeaders(model, idempotencyKey, candidate.upstreamModel),
                },
                onInvalidResponse: (headers) => refundInvalidResponse(input.userId, model, headers),
            });
            const optimizedPrompt = parseOptimizedPrompt(call.arguments);
            if (!optimizedPrompt) {
                await refundInvalidResponse(input.userId, model, call.headers);
                throw new PromptOptimizationError("默认文本模型没有返回有效提示词");
            }
            return optimizedPrompt;
        } catch (error) {
            latestError = error;
        }
    }
    throw new PromptOptimizationError(toSafeGenerationErrorMessage(latestError, "提示词优化失败，请稍后重试"));
}

function promptOptimizationInstruction(mode: PromptOptimizationMode, siteTitle: string) {
    const target = mode === "image" ? "图片" : mode === "video" ? "视频" : mode === "audio" ? "音频" : "创作";
    return `你是 ${resolveSiteTitle(siteTitle)} 提示词编辑器。把用户原文改写为清晰、紧凑、可直接发送的中文${target}提示词。保留主体、人名、品牌、数量、尺寸、比例、时长、文字内容、参考素材要求和否定要求；不得改变用户意图，不得虚构事实或添加用户没有要求的复杂设定。只返回优化后的公开提示词，不解释修改过程，不输出内部规划、模型选择理由或思维链。`;
}

function parseOptimizedPrompt(value: string) {
    try {
        const payload = JSON.parse(value) as { optimizedPrompt?: unknown };
        const prompt = typeof payload.optimizedPrompt === "string" ? payload.optimizedPrompt.trim() : "";
        return prompt && prompt.length <= CREATE_AGENT_PROMPT_MAX_LENGTH ? prompt : "";
    } catch {
        return "";
    }
}

async function refundInvalidResponse(userId: string, model: string, headers: Headers) {
    const billing = readSystemAiBilling(headers);
    if (hasSystemAiCharge(billing)) await refundGenerationCharge({ userId, receiptId: billing.billingReceiptId, model, usageKind: "text", units: 1, idempotencyKey: `prompt-optimize-refund:${billing.billingReceiptId}` });
}

const promptOptimizationTool = {
    name: "optimize_creative_prompt",
    description: "将用户原文整理为可直接发送的公开创作提示词",
    parameters: {
        type: "object",
        properties: {
            optimizedPrompt: { type: "string", minLength: 1, maxLength: CREATE_AGENT_PROMPT_MAX_LENGTH },
        },
        required: ["optimizedPrompt"],
        additionalProperties: false,
    },
};
