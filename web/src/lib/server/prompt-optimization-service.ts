import { getAuthSettings } from "@/lib/auth/store";
import type { PracticeExecutionProfile } from "@/lib/practice-domain";
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

type SystemTextInput = { origin: string; cookie: string; userId: string; requestId: string; prompt: string; executionProfile?: PracticeExecutionProfile };

export async function optimizeCreativePrompt(input: SystemTextInput & { mode: PromptOptimizationMode }) {
    return runSystemTextTool(input, {
        idempotencyScope: "prompt-optimize",
        instruction: (siteTitle) => promptOptimizationInstruction(input.mode, siteTitle),
        tool: promptOptimizationTool,
        parse: parseOptimizedPrompt,
        invalidMessage: "默认文本模型没有返回有效提示词",
        fallbackMessage: "提示词优化失败，请稍后重试",
    });
}

export async function writeSongLyrics(input: SystemTextInput) {
    return runSystemTextTool(input, {
        idempotencyScope: "lyrics-write",
        instruction: songLyricsInstruction,
        tool: songLyricsTool,
        parse: parseSongLyrics,
        invalidMessage: "默认文本模型没有返回有效歌词",
        fallbackMessage: "歌词生成失败，请稍后重试",
    });
}

type SystemTextTask = {
    idempotencyScope: string;
    instruction: (siteTitle: string) => string;
    tool: { name: string; description: string; parameters: Record<string, unknown> };
    parse: (value: string) => string;
    invalidMessage: string;
    fallbackMessage: string;
};

async function runSystemTextTool(input: SystemTextInput, task: SystemTextTask) {
    const settings = await getAuthSettings();
    const resolved = (input.executionProfile === "open-source-practice" ? [{ model: settings.practiceDefaultModels?.textModel, profile: "open-source-practice" as const }] : [{ model: settings.defaultModels.textModel, profile: "production" as const }])
        .filter((item) => Boolean(item.model))
        .map((item) => ({ model: item.model as string, profile: item.profile, candidates: resolveLogicalModelCandidates(settings, "text", item.model as string, "", item.profile) }))
        .find((item) => item.candidates.length);
    if (!resolved) throw new PromptOptimizationError("后台尚未配置可用的默认文本模型", 503);
    const { model, profile, candidates } = resolved;

    const rankedCandidates = rankTextPlanningCandidates(candidates);
    if (!rankedCandidates.length) throw new PromptOptimizationError("当前没有可用的文本模型渠道，请检查模型配置或稍后重试", 503);

    let latestError: unknown;
    for (const candidate of rankedCandidates) {
        const idempotencyKey = systemAiIdempotencyKey(task.idempotencyScope, input.userId, input.requestId, candidate.channelId, candidate.upstreamModel);
        try {
            const call = await requestStructuredText({
                origin: input.origin,
                cookie: input.cookie,
                candidate,
                messages: [
                    { role: "system", content: task.instruction(settings.site.title) },
                    { role: "user", content: input.prompt },
                ],
                tool: task.tool,
                headers: {
                    "Content-Type": "application/json",
                    "Idempotency-Key": idempotencyKey,
                    "X-Client-Request-Id": idempotencyKey,
                    ...systemAiBillingHeaders(model, idempotencyKey, candidate.upstreamModel, profile),
                },
                onInvalidResponse: (headers) => refundInvalidResponse(input.userId, model, headers, profile),
            });
            const output = task.parse(call.arguments);
            if (!output) {
                await refundInvalidResponse(input.userId, model, call.headers, profile);
                throw new PromptOptimizationError(task.invalidMessage);
            }
            return output;
        } catch (error) {
            latestError = error;
        }
    }
    throw new PromptOptimizationError(toSafeGenerationErrorMessage(latestError, task.fallbackMessage));
}

function songLyricsInstruction(siteTitle: string) {
    return `你是 ${resolveSiteTitle(siteTitle)} 的歌词作者。根据用户给出的主题、情绪或故事写一首可直接演唱的歌词。用 [Verse]、[Pre-Chorus]、[Chorus]、[Bridge]、[Outro] 等英文方括号标记分段，每个标记独占一行；副歌要押韵、易记。歌词语言跟随用户输入的语言。保留用户指定的人名、意象和必须出现的句子，不添加用户没有要求的复杂设定。只返回歌词正文，不加标题、解释、和弦或演唱说明。`;
}

function parseSongLyrics(value: string) {
    try {
        const payload = JSON.parse(value) as { lyrics?: unknown };
        const lyrics = typeof payload.lyrics === "string" ? payload.lyrics.trim() : "";
        return lyrics && lyrics.length <= CREATE_AGENT_PROMPT_MAX_LENGTH ? lyrics : "";
    } catch {
        return "";
    }
}

const songLyricsTool = {
    name: "write_song_lyrics",
    description: "根据主题写一首带 [Verse]/[Chorus] 分段标记的歌词",
    parameters: {
        type: "object",
        properties: {
            lyrics: { type: "string", minLength: 1, maxLength: CREATE_AGENT_PROMPT_MAX_LENGTH },
        },
        required: ["lyrics"],
        additionalProperties: false,
    },
};

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

async function refundInvalidResponse(userId: string, model: string, headers: Headers, executionProfile: PracticeExecutionProfile = "production") {
    const billing = readSystemAiBilling(headers);
    if (hasSystemAiCharge(billing) && executionProfile !== "open-source-practice")
        await refundGenerationCharge({ userId, receiptId: billing.billingReceiptId, model, usageKind: "text", units: 1, idempotencyKey: `prompt-optimize-refund:${billing.billingReceiptId}` });
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
