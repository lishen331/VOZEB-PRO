import { getAuthSettings } from "@/lib/auth/store";
import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { systemAiBillingHeaders, systemAiIdempotencyKey } from "@/lib/server/system-ai-billing";
import { rankTextPlanningCandidates, requestStructuredText } from "@/lib/server/text-planning-runtime";

import systemPrompts from "./layout-regenerate-l-system.json";

export class OneClickLayoutRegenerateError extends Error {
    constructor(
        message: string,
        readonly status = 502,
    ) {
        super(message);
        this.name = "OneClickLayoutRegenerateError";
    }
}

const layoutTool = {
    name: "write_layout_description",
    description: "输出 L 空间布局锚点 layout_description（1-2 句短句中文）",
    parameters: { type: "object", properties: { layout_description: { type: "string" } }, required: ["layout_description"] },
} as const;

export type OneClickLayoutInput = { project: DramaProject; episode: DramaEpisode; shot: DramaShot };
export type OneClickLayoutRuntime = { userId: string; origin: string; cookie: string; requestId: string };

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

/**
 * 组装 L `framePromptService.regenerateLayoutDescription` 的等价请求载荷。
 *
 * 字段与顺序逐字照抄 L 的 `userLines`：
 * CURRENT_SHOT # → ACTION → RESULT → DIALOGUE → SHOT_TYPE → CHARACTERS
 * → PREV_SHOT LAYOUT → NEXT_SHOT LAYOUT → 收尾指令。
 */
export function buildOneClickLayoutRequest(input: OneClickLayoutInput) {
    const { project, episode, shot } = input;
    const index = episode.shots.findIndex((item) => item.id === shot.id);
    const previous = index > 0 ? episode.shots[index - 1] : undefined;
    const next = index >= 0 && index + 1 < episode.shots.length ? episode.shots[index + 1] : undefined;
    const characterNames = shot.characterIds.map((id) => project.characters.find((item) => item.id === id)?.name).filter((name): name is string => Boolean(name?.trim()));

    const lines = [
        `CURRENT_SHOT #${shot.order || shot.id}`,
        text(shot.action) ? `ACTION: ${text(shot.action)}` : null,
        text(shot.result) ? `RESULT: ${text(shot.result)}` : null,
        text(shot.dialogue) ? `DIALOGUE: ${text(shot.dialogue)}` : null,
        text(shot.shotType) ? `SHOT_TYPE: ${text(shot.shotType)}` : null,
        characterNames.length ? `CHARACTERS: ${characterNames.join("；")}` : null,
        previous ? `PREV_SHOT #${previous.order} LAYOUT: ${text(previous.layoutDescription) || "(none)"}` : "PREV_SHOT: (first shot)",
        next ? `NEXT_SHOT #${next.order} LAYOUT: ${text(next.layoutDescription) || "(none)"}` : "NEXT_SHOT: (last shot)",
        "请严格按照系统提示要求，只输出优化后的 layout_description 文本。",
    ].filter((line): line is string => Boolean(line));

    return { systemPrompt: systemPrompts.getRegenerateLayoutDescriptionPrompt, userPrompt: lines.join("\n") };
}

/** L 的清洗：剥离代码块围栏、首尾引号、以及「布局描述：」之类前缀。 */
export function sanitizeOneClickLayout(raw: string) {
    return raw
        .trim()
        .replace(/^```[a-z]*\s*/i, "")
        .replace(/\s*```$/, "")
        .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
        .trim()
        .replace(/^(布局描述|layout_description|空间布局|画面布局)[:：]\s*/i, "")
        .trim();
}

export async function regenerateOneClickLayout(input: OneClickLayoutInput, runtime: OneClickLayoutRuntime) {
    const request = buildOneClickLayoutRequest(input);
    const settings = await getAuthSettings();
    const model = settings.defaultModels.textModel;
    const candidates = model ? resolveLogicalModelCandidates(settings, "text", model) : [];
    if (!model || !candidates.length) throw new OneClickLayoutRegenerateError("后台尚未配置可用的默认文本模型", 503);
    const ranked = rankTextPlanningCandidates(candidates);
    if (!ranked.length) throw new OneClickLayoutRegenerateError("当前没有可用的文本模型渠道，请检查模型配置或稍后重试", 503);

    let latestError: unknown;
    for (const candidate of ranked) {
        const idempotencyKey = systemAiIdempotencyKey("one-click-film-layout", runtime.userId, runtime.requestId, candidate.channelId, candidate.upstreamModel);
        try {
            const call = await requestStructuredText({
                origin: runtime.origin,
                cookie: runtime.cookie,
                candidate,
                messages: [
                    { role: "system", content: request.systemPrompt },
                    { role: "user", content: request.userPrompt },
                ],
                tool: layoutTool,
                headers: { "Content-Type": "application/json", ...systemAiBillingHeaders(model, idempotencyKey, candidate.upstreamModel) },
            });
            const parsed = JSON.parse(call.arguments) as { layout_description?: string };
            const layout = sanitizeOneClickLayout(parsed.layout_description || "");
            // L: if (!newLayout || newLayout.length < 8) throw new Error('AI 返回的布局描述过短或无效')
            if (!layout || layout.length < 8) throw new OneClickLayoutRegenerateError("AI 返回的布局描述过短或无效", 400);
            return { layout, request, model, channelId: candidate.channelId, upstreamModel: candidate.upstreamModel };
        } catch (error) {
            latestError = error;
        }
    }
    throw latestError instanceof OneClickLayoutRegenerateError ? latestError : new OneClickLayoutRegenerateError(latestError instanceof Error ? latestError.message : "布局描述重生成失败，请稍后重试");
}
