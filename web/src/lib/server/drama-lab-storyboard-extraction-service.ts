import { nanoid } from "nanoid";

import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { getAuthSettings, refundUserPoints } from "@/lib/auth/store";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { resolveDramaLabPrompt, withDramaLabPromptContract } from "@/lib/server/drama-lab-prompt-template-service";
import { recordDramaLabTextGenerationLog } from "@/lib/server/drama-lab-text-generation-log";
import { rankTextPlanningCandidates, requestStructuredText } from "@/lib/server/text-planning-runtime";
import { hasSystemAiCharge, readSystemAiBilling, systemAiBillingHeaders, systemAiIdempotencyKey } from "@/lib/server/system-ai-billing";

export class DramaLabStoryboardExtractionError extends Error {
    constructor(
        message: string,
        readonly status = 502,
    ) {
        super(message);
        this.name = "DramaLabStoryboardExtractionError";
    }
}

type ExtractedStoryboard = {
    title: string;
    description: string;
    sourceText: string;
    shotBoundary: string;
    dialogue: string;
    narration: string;
    cameraMotion: string;
    cameraAngle: string;
    shotType: string;
    location: string;
    time: string;
    action: string;
    result: string;
    emotion: string;
    emotionIntensity: number;
    layoutDescription: string;
    duration: number;
    sceneId: string;
    characterIds: string[];
    propIds: string[];
};

export async function extractDramaLabStoryboards(input: { userId: string; origin: string; cookie: string; requestId: string; project: DramaProject; episodeId: string }) {
    const episode = input.project.episodes.find((item) => item.id === input.episodeId);
    const script = episode?.script.trim() || "";
    if (!episode) throw new DramaLabStoryboardExtractionError("当前剧集不存在", 404);
    if (!script) throw new DramaLabStoryboardExtractionError("请先填写当前集剧本", 400);

    const [storyboardPrompt, outputPrompt] = await Promise.all([resolveDramaLabPrompt("storyboard_system"), resolveDramaLabPrompt("storyboard_output_format")]);
    const systemPrompt = withDramaLabPromptContract(
        `${storyboardPrompt.template}\n\n${outputPrompt.template}`,
        "只调用 extract_drama_storyboards 并返回 JSON 对象。shots 必须是数组。每个镜头必须填写 shotType、cameraAngle、location、time、action、result、emotion、emotionIntensity、layoutDescription。sceneId 只能是 availableAssets.scenes 中的真实 id，或空字符串；characterIds 和 propIds 只能引用各自对应资产列表中的真实 id。绝不能根据名称编造、猜测或新建资产 ID。不要返回 Markdown、解释、图片提示词、图片链接或未定义字段。",
    );
    const userPrompt = JSON.stringify({
        task: "从当前集剧本拆解可执行的结构化分镜",
        project: { title: input.project.title, style: input.project.style, aspectRatio: input.project.ratio },
        episode: { id: episode.id, title: episode.title, script },
        availableAssets: {
            characters: input.project.characters.map((asset) => ({ id: asset.id, name: asset.name, description: asset.description || "", visualIdentity: asset.profile?.visualIdentity || "", styling: asset.profile?.styling || "" })),
            scenes: input.project.scenes.map((asset) => ({ id: asset.id, name: asset.name, description: asset.description || "", visualIdentity: asset.profile?.visualIdentity || "" })),
            props: input.project.props.map((asset) => ({ id: asset.id, name: asset.name, description: asset.description || "", visualIdentity: asset.profile?.visualIdentity || "" })),
        },
    });

    const settings = await getAuthSettings();
    const model = settings.defaultModels.textModel;
    const startedAt = Date.now();
    const logId = `drama-lab-storyboard:${input.project.id}:${input.episodeId}:${input.requestId}`;
    const candidates = resolveLogicalModelCandidates(settings, "text", model);
    if (!model || !candidates.length) throw new DramaLabStoryboardExtractionError("后台尚未配置可用的默认文本模型", 503);

    let latestError: unknown;
    for (const candidate of rankTextPlanningCandidates(candidates)) {
        const idempotencyKey = systemAiIdempotencyKey("drama-lab-extract-storyboards", input.userId, input.project.id, input.episodeId, input.requestId, candidate.channelId, candidate.upstreamModel);
        try {
            const call = await requestStructuredText({
                origin: input.origin,
                cookie: input.cookie,
                candidate,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt },
                ],
                tool: extractDramaStoryboardsTool,
                headers: { "Content-Type": "application/json", ...systemAiBillingHeaders(model, idempotencyKey, candidate.upstreamModel) },
                onInvalidResponse: (headers) => refundInvalidResponse(input.userId, model, headers),
            });
            try {
                const shots = normalizeExtractedDramaLabStoryboards(call.arguments, input.project);
                await recordDramaLabTextGenerationLog({
                    id: logId,
                    userId: input.userId,
                    title: "分镜提取",
                    prompt: userPrompt,
                    model,
                    status: "success",
                    durationMs: call.elapsedMs,
                    createdAt: startedAt,
                });
                return { shots, templateKeys: [storyboardPrompt.key, outputPrompt.key] as const };
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
        title: "分镜提取",
        prompt: userPrompt,
        model,
        status: "failed",
        durationMs: Date.now() - startedAt,
        error: latestError instanceof Error ? latestError.message : "分镜提取失败",
        createdAt: startedAt,
    });
    throw latestError instanceof DramaLabStoryboardExtractionError ? latestError : new DramaLabStoryboardExtractionError(latestError instanceof Error ? latestError.message : "分镜提取失败，请稍后重试");
}

export function normalizeExtractedDramaLabStoryboards(value: string, project: DramaProject): DramaShot[] {
    const payload = parseObject(value);
    if (!payload) throw new DramaLabStoryboardExtractionError("文本模型没有返回有效的分镜提取结果");
    const sourceShots = array(payload.shots);
    if (!sourceShots.length) throw new DramaLabStoryboardExtractionError("文本模型没有返回任何分镜");

    const sceneIds = new Set(project.scenes.map((asset) => asset.id));
    const characterIds = new Set(project.characters.map((asset) => asset.id));
    const propIds = new Set(project.props.map((asset) => asset.id));
    return sourceShots.map((value, index) => {
        const shot = parseStoryboard(value, index + 1);
        assertAssetReferences(shot, sceneIds, characterIds, propIds, index + 1);
        return {
            id: `shot_${nanoid()}`,
            order: index + 1,
            title: shot.title,
            description: shot.description,
            sourceText: shot.sourceText,
            shotBoundary: shot.shotBoundary,
            dialogue: shot.dialogue,
            narration: shot.narration,
            utterances: [],
            imagePrompt: "",
            videoPrompt: "",
            cameraMotion: shot.cameraMotion,
            shotType: shot.shotType,
            cameraAngle: shot.cameraAngle,
            location: shot.location,
            time: shot.time,
            action: shot.action,
            result: shot.result,
            emotion: shot.emotion,
            emotionIntensity: shot.emotionIntensity,
            layoutDescription: shot.layoutDescription,
            continuity: shot.cameraAngle ? emptyContinuity(shot.cameraAngle, shot.shotType) : undefined,
            duration: shot.duration,
            characterIds: shot.characterIds,
            propIds: shot.propIds,
            clueIds: [],
            ...(shot.sceneId ? { sceneId: shot.sceneId } : {}),
        };
    });
}

function parseStoryboard(value: unknown, order: number): ExtractedStoryboard {
    const shot = object(value);
    if (!shot) throw new DramaLabStoryboardExtractionError(`第 ${order} 个分镜不是对象`);
    const title = requiredText(shot.title, "title", order);
    const description = requiredText(shot.description, "description", order);
    const sourceText = optionalText(shot.sourceText) || description;
    const duration = shot.duration;
    if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
        throw new DramaLabStoryboardExtractionError(`第 ${order} 个分镜的 duration 必须是大于 0 的数字`);
    }
    return {
        title,
        description,
        sourceText,
        shotBoundary: optionalText(shot.shotBoundary),
        dialogue: optionalText(shot.dialogue),
        narration: optionalText(shot.narration),
        cameraMotion: optionalText(shot.cameraMotion),
        cameraAngle: optionalText(shot.cameraAngle),
        shotType: optionalText(shot.shotType),
        location: optionalText(shot.location),
        time: optionalText(shot.time),
        action: optionalText(shot.action) || description,
        result: optionalText(shot.result),
        emotion: optionalText(shot.emotion),
        emotionIntensity: numberValue(shot.emotionIntensity),
        layoutDescription: optionalText(shot.layoutDescription),
        duration,
        sceneId: optionalText(shot.sceneId),
        characterIds: requiredIds(shot.characterIds, "characterIds", order),
        propIds: requiredIds(shot.propIds, "propIds", order),
    };
}

function assertAssetReferences(shot: ExtractedStoryboard, sceneIds: Set<string>, characterIds: Set<string>, propIds: Set<string>, order: number) {
    if (shot.sceneId && !sceneIds.has(shot.sceneId)) throw new DramaLabStoryboardExtractionError(`第 ${order} 个分镜引用了项目中不存在的场景 ID：${shot.sceneId}`);
    const invalidCharacterId = shot.characterIds.find((id) => !characterIds.has(id));
    if (invalidCharacterId) throw new DramaLabStoryboardExtractionError(`第 ${order} 个分镜引用了项目中不存在的角色 ID：${invalidCharacterId}`);
    const invalidPropId = shot.propIds.find((id) => !propIds.has(id));
    if (invalidPropId) throw new DramaLabStoryboardExtractionError(`第 ${order} 个分镜引用了项目中不存在的道具 ID：${invalidPropId}`);
}

function emptyContinuity(cameraAngle: string, shotType = "") {
    return {
        shotSize: shotType,
        cameraAngle,
        composition: "",
        characterBlocking: "",
        gazeDirection: "",
        actionStart: "",
        actionEnd: "",
        screenDirection: "",
        axisRule: "",
        continuityNotes: "",
    };
}

function numberValue(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(-1, Math.min(3, Math.round(value))) : 0;
}

function requiredText(value: unknown, field: string, order: number) {
    const result = optionalText(value);
    if (!result) throw new DramaLabStoryboardExtractionError(`第 ${order} 个分镜缺少 ${field}`);
    return result;
}

function optionalText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function requiredIds(value: unknown, field: string, order: number) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || !item.trim())) {
        throw new DramaLabStoryboardExtractionError(`第 ${order} 个分镜的 ${field} 必须是字符串 ID 数组`);
    }
    return [...new Set(value.map((item) => item.trim()))];
}

function parseObject(value: string) {
    try {
        return object(JSON.parse(value));
    } catch {
        return null;
    }
}

function object(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function array(value: unknown) {
    return Array.isArray(value) ? value : [];
}

async function refundInvalidResponse(userId: string, model: string, headers: Headers) {
    const billing = readSystemAiBilling(headers);
    if (hasSystemAiCharge(billing)) await refundUserPoints(userId, model, billing.pointsCost, "text", 1, undefined, billing.pointsRecordId);
}

const extractDramaStoryboardsTool = {
    name: "extract_drama_storyboards",
    description: "将当前短剧集剧本拆解为引用项目已有资产 ID 的结构化分镜",
    parameters: {
        type: "object",
        properties: {
            shots: {
                type: "array",
                items: {
                    type: "object",
                    properties: {
                        title: { type: "string" },
                        description: { type: "string" },
                        sourceText: { type: "string" },
                        shotBoundary: { type: "string" },
                        dialogue: { type: "string" },
                        narration: { type: "string" },
                        cameraMotion: { type: "string" },
                        cameraAngle: { type: "string" },
                        shotType: { type: "string" },
                        location: { type: "string" },
                        time: { type: "string" },
                        action: { type: "string" },
                        result: { type: "string" },
                        emotion: { type: "string" },
                        emotionIntensity: { type: "number" },
                        layoutDescription: { type: "string" },
                        duration: { type: "number" },
                        sceneId: { type: "string" },
                        characterIds: { type: "array", items: { type: "string" } },
                        propIds: { type: "array", items: { type: "string" } },
                    },
                    required: [
                        "title",
                        "description",
                        "sourceText",
                        "shotBoundary",
                        "dialogue",
                        "narration",
                        "cameraMotion",
                        "cameraAngle",
                        "shotType",
                        "location",
                        "time",
                        "action",
                        "result",
                        "emotion",
                        "emotionIntensity",
                        "layoutDescription",
                        "duration",
                        "sceneId",
                        "characterIds",
                        "propIds",
                    ],
                    additionalProperties: false,
                },
            },
        },
        required: ["shots"],
        additionalProperties: false,
    },
} as const;
