import { getAuthSettings, refundUserPoints } from "@/lib/auth/store";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { resolveDramaLabPrompt } from "@/lib/server/drama-lab-prompt-template-service";
import { recordDramaLabTextGenerationLog } from "@/lib/server/drama-lab-text-generation-log";
import { hasSystemAiCharge, readSystemAiBilling, systemAiBillingHeaders, systemAiIdempotencyKey } from "@/lib/server/system-ai-billing";
import { rankTextPlanningCandidates, requestStructuredText } from "@/lib/server/text-planning-runtime";

export class DramaLabScriptGenerationError extends Error {
    constructor(
        message: string,
        readonly status = 502,
    ) {
        super(message);
    }
}

export async function generateDramaLabScript(input: {
    userId: string;
    origin: string;
    cookie: string;
    projectId: string;
    episodeId: string;
    requestId: string;
    storyOutline: string;
    storyStyle: string;
    scriptType: string;
    episodeCount: string;
}) {
    const outline = input.storyOutline.trim();
    if (!outline) throw new DramaLabScriptGenerationError("请先输入故事梗概", 400);
    const prompt = await resolveDramaLabPrompt("story_generation");
    const settings = await getAuthSettings();
    const model = settings.defaultModels.textModel;
    const startedAt = Date.now();
    const logId = `drama-lab-script:${input.projectId}:${input.episodeId}:${input.requestId}`;
    const candidates = resolveLogicalModelCandidates(settings, "text", model);
    if (!model || !candidates.length) throw new DramaLabScriptGenerationError("后台尚未配置可用的默认文本模型", 503);

    const context = JSON.stringify({
        task: "生成当前短剧集的完整剧本",
        storyOutline: outline,
        storyStyle: input.storyStyle.trim(),
        scriptType: input.scriptType.trim(),
        plannedEpisodeCount: input.episodeCount.trim(),
        currentEpisodeId: input.episodeId,
    });
    let latestError: unknown;
    for (const candidate of rankTextPlanningCandidates(candidates)) {
        const idempotencyKey = systemAiIdempotencyKey("drama-lab-generate-script", input.userId, input.projectId, input.episodeId, input.requestId, candidate.channelId, candidate.upstreamModel);
        try {
            const call = await requestStructuredText({
                origin: input.origin,
                cookie: input.cookie,
                candidate,
                messages: [
                    { role: "system", content: `${prompt.template}\n\n【系统固定输出契约，不可由模板覆盖】\n只调用 generate_drama_script 并返回 JSON 对象。script 必须是当前一集完整中文剧本文字；不要输出 Markdown、说明、标题前缀或其他字段。` },
                    { role: "user", content: context },
                ],
                tool: generateDramaScriptTool,
                headers: { "Content-Type": "application/json", ...systemAiBillingHeaders(model, idempotencyKey, candidate.upstreamModel) },
                onInvalidResponse: (headers) => refundInvalidResponse(input.userId, model, headers),
            });
            try {
                const script = parseScript(call.arguments);
                if (!script) throw new DramaLabScriptGenerationError("文本模型没有返回有效剧本");
                await recordDramaLabTextGenerationLog({
                    id: logId,
                    userId: input.userId,
                    title: "剧本生成",
                    prompt: context,
                    model,
                    status: "success",
                    durationMs: call.elapsedMs,
                    createdAt: startedAt,
                });
                return { script, templateKey: prompt.key };
            } catch (error) {
                await refundInvalidResponse(input.userId, model, call.headers);
                throw error;
            }
        } catch (error) {
            latestError = error;
        }
    }
    await recordDramaLabTextGenerationLog({
        id: logId,
        userId: input.userId,
        title: "剧本生成",
        prompt: context,
        model,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: latestError instanceof Error ? latestError.message : "剧本生成失败",
        createdAt: startedAt,
    });
    throw latestError instanceof DramaLabScriptGenerationError
        ? latestError
        : new DramaLabScriptGenerationError(latestError instanceof Error ? latestError.message : "剧本生成失败，请稍后重试");
}

function parseScript(value: string) {
    try {
        const parsed = JSON.parse(value) as { script?: unknown };
        return typeof parsed.script === "string" ? parsed.script.trim().slice(0, 100_000) : "";
    } catch {
        return "";
    }
}

async function refundInvalidResponse(userId: string, model: string, headers: Headers) {
    const billing = readSystemAiBilling(headers);
    if (hasSystemAiCharge(billing)) await refundUserPoints(userId, model, billing.pointsCost, "text", 1, undefined, billing.pointsRecordId);
}

const generateDramaScriptTool = {
    name: "generate_drama_script",
    description: "根据短剧故事梗概生成当前一集完整剧本",
    parameters: {
        type: "object",
        properties: { script: { type: "string", minLength: 1 } },
        required: ["script"],
        additionalProperties: false,
    },
} as const;
