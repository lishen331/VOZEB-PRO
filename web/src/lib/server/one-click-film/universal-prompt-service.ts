import systemPrompts from "./universal-prompt-l-system.json";
import { buildOneClickUniversalPromptInput, type OneClickUniversalPromptInput } from "./universal-prompt-contract";
import { rankTextPlanningCandidates, requestStructuredText } from "@/lib/server/text-planning-runtime";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { getAuthSettings } from "@/lib/auth/store";
import { systemAiBillingHeaders, systemAiIdempotencyKey } from "@/lib/server/system-ai-billing";

export class OneClickUniversalPromptError extends Error {
    constructor(
        message: string,
        readonly status = 502,
    ) {
        super(message);
        this.name = "OneClickUniversalPromptError";
    }
}

const universalSegmentTool = {
    name: "write_universal_segment_text",
    description: "按 L 全能分镜多子分镜段落格式输出 universal_segment_text",
    parameters: { type: "object", properties: { universal_segment_text: { type: "string" } }, required: ["universal_segment_text"] },
} as const;

export type OneClickUniversalPromptRuntime = { userId: string; origin: string; cookie: string; requestId: string; mode: "generate" | "polish" };

/** 组装 L 等价的最终请求载荷，供快照测试和真实调用共用，不能悄悄改写字段。 */
export function buildOneClickUniversalPromptRequest(input: OneClickUniversalPromptInput, runtime: Pick<OneClickUniversalPromptRuntime, "mode">) {
    const bundle = buildOneClickUniversalPromptInput(input);
    const systemPrompt = runtime.mode === "polish" ? `${systemPrompts.getUniversalOmniSegmentPrompt}\n\n${systemPrompts.polishSuffix}` : systemPrompts.getUniversalOmniSegmentPrompt;
    const userPrompt = JSON.stringify({
        MULTI_BEAT_OUTPUT: true,
        TOTAL_CLIP_SECONDS: bundle.fields.DURATION_SECONDS,
        LINE3_REQUIRED: systemPrompts.line3,
        STYLE_HINT: bundle.fields.PROJECT_STYLE,
        ASPECT_RATIO: bundle.fields.ASPECT_RATIO,
        IMAGE_SLOT_MAP: bundle.references,
        FORCE_WITHOUT_REFERENCE_IMAGES: bundle.fields.FORCE_WITHOUT_REFERENCE_IMAGES,
        CURRENT_UNIVERSAL_SEGMENT: bundle.fields.CURRENT_UNIVERSAL_SEGMENT,
        EPISODE_SCRIPT: bundle.fields.EPISODE_SCRIPT,
        SHOT_FIELDS: {
            TITLE: bundle.fields.TITLE,
            DESCRIPTION: bundle.fields.DESCRIPTION,
            LOCATION: bundle.fields.LOCATION,
            TIME: bundle.fields.TIME,
            ACTION: bundle.fields.ACTION,
            DIALOGUE: bundle.fields.DIALOGUE,
            NARRATION: bundle.fields.NARRATION,
            RESULT: bundle.fields.RESULT,
            ATMOSPHERE: bundle.fields.ATMOSPHERE,
            SHOT_TYPE: bundle.fields.SHOT_TYPE,
            MOVEMENT: bundle.fields.MOVEMENT,
            LIGHTING: bundle.fields.LIGHTING,
            DEPTH_OF_FIELD: bundle.fields.DEPTH_OF_FIELD,
        },
    });
    return { systemPrompt, userPrompt, systemContract: bundle.systemContract, references: bundle.references };
}

/** 真实调用：与分镜提取一样走 requestStructuredText，不允许旁路一个简化 prompt。 */
export async function generateOneClickUniversalPrompt(input: OneClickUniversalPromptInput, runtime: OneClickUniversalPromptRuntime) {
    const request = buildOneClickUniversalPromptRequest(input, runtime);
    const settings = await getAuthSettings();
    const model = settings.defaultModels.textModel;
    const candidates = resolveLogicalModelCandidates(settings, "text", model);
    if (!model || !candidates.length) throw new OneClickUniversalPromptError("后台尚未配置可用的默认文本模型", 503);
    const ranked = rankTextPlanningCandidates(candidates);
    if (!ranked.length) throw new OneClickUniversalPromptError("当前没有可用的文本模型渠道，请检查模型配置或稍后重试", 503);
    let latestError: unknown;
    for (const candidate of ranked) {
        const idempotencyKey = systemAiIdempotencyKey(`one-click-film-universal-${runtime.mode}`, runtime.userId, runtime.requestId, candidate.channelId, candidate.upstreamModel);
        try {
            const call = await requestStructuredText({
                origin: runtime.origin,
                cookie: runtime.cookie,
                candidate,
                messages: [
                    { role: "system", content: request.systemPrompt },
                    { role: "user", content: request.userPrompt },
                ],
                tool: universalSegmentTool,
                headers: { "Content-Type": "application/json", ...systemAiBillingHeaders(model, idempotencyKey, candidate.upstreamModel) },
            });
            const parsed = JSON.parse(call.arguments) as { universal_segment_text?: string };
            const text = parsed.universal_segment_text?.trim();
            if (!text) throw new OneClickUniversalPromptError("模型没有返回全能提示词文本");
            return { text, request, model, channelId: candidate.channelId, upstreamModel: candidate.upstreamModel };
        } catch (error) {
            latestError = error;
        }
    }
    throw latestError instanceof OneClickUniversalPromptError ? latestError : new OneClickUniversalPromptError(latestError instanceof Error ? latestError.message : "全能提示词生成失败，请稍后重试");
}
