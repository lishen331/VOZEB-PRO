import type { DramaProject, DramaShot, DramaShotFrameType } from "@/lib/drama-project-contract";
import { getAuthSettings } from "@/lib/auth/store";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { resolveDramaLabPrompt, withDramaLabPromptContract } from "@/lib/server/drama-lab-prompt-template-service";
import { recordDramaLabTextGenerationLog } from "@/lib/server/drama-lab-text-generation-log";
import { rankTextPlanningCandidates, requestStructuredText } from "@/lib/server/text-planning-runtime";
import { hasSystemAiCharge, readSystemAiBilling, systemAiBillingHeaders, systemAiIdempotencyKey } from "@/lib/server/system-ai-billing";
import { refundGenerationCharge } from "@/lib/server/generation-charge-service";
import { sanitizeDramaLabFramePrompt } from "@/lib/server/drama-lab-frame-prompt-sanitize";
import { assertDramaLabShotAssetReferences, findShot, shotReferences, type DramaLabGenerationReference, DramaLabShotGenerationError } from "@/lib/server/drama-lab-shot-generation-service";

const FRAME_TYPES = ["first", "key", "last"] as const;
export function isDramaShotFrameType(value: unknown): value is DramaShotFrameType {
    return typeof value === "string" && FRAME_TYPES.includes(value as DramaShotFrameType);
}

export async function prepareDramaLabFrame(input: { userId: string; origin: string; cookie: string; requestId: string; project: DramaProject; episodeId: string; shotId: string; frameType: DramaShotFrameType }) {
    const { episode, shot } = findShot(input.project, input.episodeId, input.shotId);
    assertBindings(input.project, shot);
    assertDramaLabShotAssetReferences(input.project, shot);
    const promptKey = `${input.frameType}_frame_prompt` as "first_frame_prompt" | "key_frame_prompt" | "last_frame_prompt";
    const template = await resolveDramaLabPrompt(promptKey);
    const references = frameReferences(input.project, shot, input.frameType);
    const context = frameContext(input.project, episode.title, shot, input.frameType);
    const systemPrompt = withDramaLabPromptContract(
        `${template.template}\n\n${context}`,
        `只返回 JSON 对象，字段严格为 prompt 和 description。prompt 必须是可直接交给图片模型的中文提示词。只允许本镜 characterIds 中角色，不得引入未绑定资产；角色外貌只能引用参考图；场景必须是纯空间描述；道具必须符合时代真实尺度。${input.frameType === "last" ? "尾帧必须读取首帧布局并根据 declared movement 做自然取景演化。" : ""}`,
    );
    const userPrompt = JSON.stringify({
        task: `${input.frameType} frame prompt planning`,
        project: { id: input.project.id, title: input.project.title, style: input.project.style, ratio: input.project.ratio },
        episode: { title: episode.title },
        shot: { ...shot },
        boundAssets: references.map((reference) => ({ id: reference.id, label: reference.label, url: reference.url })),
    });
    const settings = await getAuthSettings();
    const model = settings.defaultModels.textModel;
    const candidates = resolveLogicalModelCandidates(settings, "text", model);
    if (!model || !candidates.length) throw new DramaLabShotGenerationError("后台尚未配置可用的默认文本模型", 503);
    let latestError: unknown;
    const startedAt = Date.now();
    const logId = `drama-lab-frame:${input.project.id}:${input.episodeId}:${shot.id}:${input.frameType}:${input.requestId}`;
    for (const candidate of rankTextPlanningCandidates(candidates)) {
        const idempotencyKey = systemAiIdempotencyKey("drama-lab-frame-prompt", input.userId, input.project.id, input.episodeId, shot.id, input.frameType, input.requestId, candidate.channelId, candidate.upstreamModel);
        try {
            const call = await requestStructuredText({
                origin: input.origin,
                cookie: input.cookie,
                candidate,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                tool: framePromptTool,
                headers: { "Content-Type": "application/json", ...systemAiBillingHeaders(model, idempotencyKey, candidate.upstreamModel) },
                onInvalidResponse: (headers) => refundInvalidFrameResponse(input.userId, model, headers),
            });
            try {
                const parsed = parseFrameResult(call.arguments);
                const sanitized = sanitizeDramaLabFramePrompt(
                    parsed.prompt,
                    shot.characterIds.map((id) => input.project.characters.find((asset) => asset.id === id)?.name || "").filter(Boolean),
                    input.project.characters.map((asset) => asset.name),
                );
                await recordDramaLabTextGenerationLog({ id: logId, userId: input.userId, title: `${input.frameType} 帧提示词规划`, prompt: userPrompt, model, status: "success", durationMs: call.elapsedMs, createdAt: startedAt });
                return { ...sanitized, description: parsed.description, templateKey: template.key, references, model, shot };
            } catch (error) {
                await refundInvalidFrameResponse(input.userId, model, call.headers);
                throw error;
            }
        } catch (error) {
            latestError = error;
        }
    }
    await recordDramaLabTextGenerationLog({
        id: logId,
        userId: input.userId,
        title: `${input.frameType} 帧提示词规划`,
        prompt: userPrompt,
        model,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: latestError instanceof Error ? latestError.message : "帧提示词规划失败",
        createdAt: startedAt,
    });
    throw latestError instanceof Error ? latestError : new DramaLabShotGenerationError("帧提示词规划失败", 502);
}

function frameContext(project: DramaProject, episodeTitle: string, shot: DramaShot, frameType: DramaShotFrameType) {
    return [
        "【短剧实验室帧提示词上下文】",
        `项目：${project.title}`,
        `剧集：${episodeTitle}`,
        `风格：${project.style || "未设置"}`,
        `比例：${project.ratio}`,
        `帧类型：${frameType}`,
        `镜头：${shot.title}`,
        `内容：${shot.description || shot.sourceText}`,
        shot.shotType ? `景别：${shot.shotType}` : "",
        shot.cameraAngle ? `机位：${shot.cameraAngle}` : "",
        shot.cameraMotion ? `运镜：${shot.cameraMotion}` : "",
        shot.location ? `地点：${shot.location}` : "",
        shot.time ? `时间：${shot.time}` : "",
        shot.action ? `动作：${shot.action}` : "",
        shot.result ? `结果：${shot.result}` : "",
        shot.emotion ? `情绪：${shot.emotion}（${shot.emotionIntensity ?? 0}）` : "",
        shot.layoutDescription ? `空间布局锚点：${shot.layoutDescription}` : "",
        shot.dialogue ? `对白：${shot.dialogue}` : "",
        shot.narration ? `旁白：${shot.narration}` : "",
        frameType === "last" && shot.frames?.first?.prompt ? `首帧布局参考：${shot.frames.first.prompt}` : "",
    ]
        .filter(Boolean)
        .join("\n");
}

function frameReferences(project: DramaProject, shot: DramaShot, frameType: DramaShotFrameType): DramaLabGenerationReference[] {
    const references = shotReferences(project, shot);
    if (frameType === "last" && shot.frames?.first?.url) return [{ id: `first-frame-${shot.id}`, url: shot.frames.first.url, label: `${shot.title} 首帧`, width: shot.frames.first.width, height: shot.frames.first.height }, ...references];
    return references;
}

function assertBindings(project: DramaProject, shot: DramaShot) {
    if (shot.sceneId && !project.scenes.some((asset) => asset.id === shot.sceneId)) throw new DramaLabShotGenerationError("分镜关联了当前项目不存在的场景");
    if (shot.characterIds.some((id) => !project.characters.some((asset) => asset.id === id))) throw new DramaLabShotGenerationError("分镜关联了当前项目不存在的角色");
    if (shot.propIds.some((id) => !project.props.some((asset) => asset.id === id))) throw new DramaLabShotGenerationError("分镜关联了当前项目不存在的道具");
}

function parseFrameResult(value: string) {
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw new DramaLabShotGenerationError("文本模型没有返回有效的帧提示词 JSON");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new DramaLabShotGenerationError("帧提示词结果必须是 JSON 对象");
    const record = parsed as Record<string, unknown>;
    const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
    const description = typeof record.description === "string" ? record.description.trim() : "";
    if (!prompt || !description) throw new DramaLabShotGenerationError("帧提示词必须包含 prompt 和 description");
    return { prompt, description };
}

async function refundInvalidFrameResponse(userId: string, model: string, headers: Headers) {
    const billing = readSystemAiBilling(headers);
    if (hasSystemAiCharge(billing)) await refundGenerationCharge({ userId, receiptId: billing.billingReceiptId, model, usageKind: "text", units: 1, idempotencyKey: `drama-lab-refund:${billing.billingReceiptId}` });
}

const framePromptTool = {
    name: "plan_drama_frame_prompt",
    description: "为短剧实验室首帧、关键帧或尾帧生成结构化图片提示词",
    parameters: { type: "object", properties: { prompt: { type: "string" }, description: { type: "string" } }, required: ["prompt", "description"], additionalProperties: false },
} as const;
