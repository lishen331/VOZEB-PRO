import { getAuthSettings } from "@/lib/auth/store";
import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { systemAiBillingHeaders, systemAiIdempotencyKey } from "@/lib/server/system-ai-billing";
import { rankTextPlanningCandidates, requestStructuredText } from "@/lib/server/text-planning-runtime";

import systemPrompts from "./image-polish-l-system.json";

export class OneClickImagePolishError extends Error {
    constructor(
        message: string,
        readonly status = 502,
    ) {
        super(message);
        this.name = "OneClickImagePolishError";
    }
}

const imagePolishTool = {
    name: "write_polished_image_prompt",
    description: "输出 L 图片提示词润色结果（单段纯中文静态单帧提示词）",
    parameters: { type: "object", properties: { polished_prompt: { type: "string" } }, required: ["polished_prompt"] },
} as const;

export type OneClickImagePolishInput = { project: DramaProject; episode: DramaEpisode; shot: DramaShot };
export type OneClickImagePolishRuntime = { userId: string; origin: string; cookie: string; requestId: string };

function assetNames(project: DramaProject, shot: DramaShot) {
    const names = [
        ...shot.characterIds.map((id) => project.characters.find((item) => item.id === id)?.name),
        ...shot.propIds.map((id) => project.props.find((item) => item.id === id)?.name),
        project.scenes.find((item) => item.id === shot.sceneId)?.name,
    ].filter((name): name is string => Boolean(name?.trim()));
    return names.join(", ");
}

function summarize(shot: DramaShot | undefined, fallback: string) {
    if (!shot) return fallback;
    const text = shot.action?.trim() || shot.description?.trim() || shot.sourceText?.trim() || "";
    return text || fallback;
}

/**
 * 组装 L `polishPrompt` 的等价请求载荷。
 *
 * 字段与顺序照抄 L `storyboards.js` 里的 `userPromptLines`：
 * 画风块 → PROMPT → ACTION → DIALOGUE → RESULT → ATMOSPHERE → SHOT_TYPE
 * → STYLE_TOKENS → ASSETS → CONTEXT_PREV → CONTEXT_NEXT → REMINDER。
 * 抽成纯函数便于快照测试，避免有人悄悄改写字段。
 */
export function buildOneClickImagePolishRequest(input: OneClickImagePolishInput) {
    const { project, episode, shot } = input;
    const style = project.style?.trim() || "";
    const index = episode.shots.findIndex((item) => item.id === shot.id);
    const previous = index > 0 ? episode.shots[index - 1] : undefined;
    const next = index >= 0 && index + 1 < episode.shots.length ? episode.shots[index + 1] : undefined;

    const lines = [
        style ? `【画风·最高优先级】${style}` : null,
        shot.imagePrompt?.trim() ? `PROMPT: ${shot.imagePrompt.trim()}` : null,
        shot.action?.trim() ? `ACTION: ${shot.action.trim()}` : null,
        shot.dialogue?.trim() ? `DIALOGUE: ${shot.dialogue.trim()}` : null,
        shot.result?.trim() ? `RESULT: ${shot.result.trim()}` : null,
        shot.atmosphere?.trim() ? `ATMOSPHERE: ${shot.atmosphere.trim()}` : null,
        shot.shotType?.trim() ? `SHOT_TYPE: ${shot.shotType.trim()}` : null,
        `STYLE_TOKENS (repeat in output): ${style || "cinematic movie still"}`,
        `ASSETS: ${assetNames(project, shot) || "none"}`,
        `CONTEXT_PREV: ${summarize(previous, "(first shot)")}`,
        `CONTEXT_NEXT: ${summarize(next, "(last shot)")}`,
        "REMINDER: Output a STATIC SINGLE-FRAME image prompt only. No camera motion, no transitions, no split panels.",
    ].filter((line): line is string => Boolean(line));

    return { systemPrompt: systemPrompts.getImagePolishPrompt, userPrompt: lines.join("\n") };
}

/** L 要求可润色内容至少有 image_prompt / action / dialogue 之一。 */
export function assertOneClickImagePolishable(shot: DramaShot) {
    if (!shot.imagePrompt?.trim() && !shot.action?.trim() && !shot.dialogue?.trim()) {
        throw new OneClickImagePolishError("该分镜暂无可优化的内容（图片提示词 / 动作 / 对白均为空）", 400);
    }
}

export async function polishOneClickImagePrompt(input: OneClickImagePolishInput, runtime: OneClickImagePolishRuntime) {
    assertOneClickImagePolishable(input.shot);
    const request = buildOneClickImagePolishRequest(input);
    const settings = await getAuthSettings();
    const model = settings.defaultModels.textModel;
    const candidates = model ? resolveLogicalModelCandidates(settings, "text", model) : [];
    if (!model || !candidates.length) throw new OneClickImagePolishError("后台尚未配置可用的默认文本模型", 503);
    const ranked = rankTextPlanningCandidates(candidates);
    if (!ranked.length) throw new OneClickImagePolishError("当前没有可用的文本模型渠道，请检查模型配置或稍后重试", 503);

    let latestError: unknown;
    for (const candidate of ranked) {
        const idempotencyKey = systemAiIdempotencyKey("one-click-film-image-polish", runtime.userId, runtime.requestId, candidate.channelId, candidate.upstreamModel);
        try {
            const call = await requestStructuredText({
                origin: runtime.origin,
                cookie: runtime.cookie,
                candidate,
                messages: [
                    { role: "system", content: request.systemPrompt },
                    { role: "user", content: request.userPrompt },
                ],
                tool: imagePolishTool,
                headers: { "Content-Type": "application/json", ...systemAiBillingHeaders(model, idempotencyKey, candidate.upstreamModel) },
            });
            const parsed = JSON.parse(call.arguments) as { polished_prompt?: string };
            const text = parsed.polished_prompt?.trim();
            if (!text) throw new OneClickImagePolishError("模型没有返回润色后的提示词");
            // L 会拒绝过短返回：'AI 返回内容过短，请检查文本模型配置'
            if (text.length < 10) throw new OneClickImagePolishError("AI 返回内容过短，请检查文本模型配置", 400);
            return { text, request, model, channelId: candidate.channelId, upstreamModel: candidate.upstreamModel };
        } catch (error) {
            latestError = error;
        }
    }
    throw latestError instanceof OneClickImagePolishError ? latestError : new OneClickImagePolishError(latestError instanceof Error ? latestError.message : "图片提示词润色失败，请稍后重试");
}
