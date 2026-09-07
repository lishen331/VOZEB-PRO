import { nanoid } from "nanoid";
import { jsonrepair } from "jsonrepair";

import type { DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { getAuthSettings } from "@/lib/auth/store";
import { resolveLogicalModelCandidates } from "@/lib/server/logical-model-router";
import { resolveDramaLabPrompt, withDramaLabPromptContract } from "@/lib/server/drama-lab-prompt-template-service";
import { recordDramaLabTextGenerationLog } from "@/lib/server/drama-lab-text-generation-log";
import { rankTextPlanningCandidates, requestStructuredText } from "@/lib/server/text-planning-runtime";
import { hasSystemAiCharge, readSystemAiBilling, systemAiBillingHeaders, systemAiIdempotencyKey } from "@/lib/server/system-ai-billing";
import { refundGenerationCharge } from "@/lib/server/generation-charge-service";

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
    shotNumber: number;
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
    segmentIndex: number;
    segmentTitle: string;
    atmosphere: string;
    lightingStyle: string;
    depthOfField: string;
    creationMode: "classic" | "universal";
    universalSegmentText: string;
    polishedPrompt: string;
    imagePrompt: string;
    videoPrompt: string;
    angleH: string;
    angleV: string;
    angleS: string;
    continuity?: DramaShot["continuity"];
};

export type DramaStoryboardExtractionMeta = {
    truncated: boolean;
    recoveredCount: number;
    duplicateCount: number;
    continuationAttempts: number;
};

type StoryboardTextRequestInput = {
    input: StoryboardExtractionInput;
    candidate: Parameters<typeof requestStructuredText>[0]["candidate"];
    systemPrompt: string;
    userPrompt: string;
    model: string;
    idempotencyKey: string;
    preferNativeTools?: boolean;
    onStreamPartial?: (argumentsText: string) => Promise<void>;
};

type NormalizedStoryboardResult = {
    shots: DramaShot[];
    meta: DramaStoryboardExtractionMeta;
};

type StoryboardExtractionInput = {
    userId: string;
    origin: string;
    cookie: string;
    requestId: string;
    project: DramaProject;
    episodeId: string;
    /** Previously persisted shots used to continue an interrupted extraction. */
    resumeShots?: DramaShot[];
    /** Called after each recoverable batch so callers can persist a checkpoint. */
    onPartial?: (shots: DramaShot[], meta: DramaStoryboardExtractionMeta) => Promise<void>;
};

export async function extractDramaLabStoryboards(input: StoryboardExtractionInput) {
    const episode = input.project.episodes.find((item) => item.id === input.episodeId);
    const script = episode?.script.trim() || "";
    if (!episode) throw new DramaLabStoryboardExtractionError("当前剧集不存在", 404);
    if (!script) throw new DramaLabStoryboardExtractionError("请先填写当前集剧本", 400);

    const [storyboardPrompt, outputPrompt] = await Promise.all([resolveDramaLabPrompt("storyboard_system"), resolveDramaLabPrompt("storyboard_output_format")]);
    const systemPrompt = withDramaLabPromptContract(
        `${storyboardPrompt.template}\n\n${outputPrompt.template}`,
        "只调用 extract_drama_storyboards 并返回 JSON 对象，不要返回 Markdown 或解释。shots 必须是数组；每个镜头必须填写 shotNumber、title、description、sourceText、shotBoundary、segmentIndex、segmentTitle、shotType、cameraAngle、cameraMotion、angleH、angleV、angleS、location、time、action、result、emotion、emotionIntensity、atmosphere、lightingStyle、depthOfField、layoutDescription、duration、dialogue、narration、creationMode、universalSegmentText、polishedPrompt、imagePrompt、videoPrompt、continuity、sceneId、characterIds、propIds。sceneId 只能是 availableAssets.scenes 中的真实 id，或空字符串；characterIds 和 propIds 只能引用各自对应资产列表中的真实 id，且只能包含本镜实际出场的资产。绝不能根据名称编造、猜测或新建资产 ID。imagePrompt 和 videoPrompt 必须是可执行的提示词文本，不得是图片链接。creationMode 只能为 classic 或 universal；universal 模式必须填写包含时间线和至少两步运镜的 universalSegmentText。未使用的可选文本字段使用空字符串，未使用的 ID 数组返回空数组。不得返回未定义字段。",
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

    // Check if there are any healthy candidates before attempting extraction
    const rankedCandidates = rankTextPlanningCandidates(candidates);
    if (!rankedCandidates.length) {
        throw new DramaLabStoryboardExtractionError("当前没有可用的文本模型渠道，请检查模型配置或稍后重试", 503);
    }

    let latestError: unknown;
    const resumeShots = (input.resumeShots || []).filter((shot) => shot && Number.isFinite(shot.order) && shot.order > 0);
    const initialPrompt = resumeShots.length ? buildContinuationPrompt(userPrompt, resumeShots, Math.max(...resumeShots.map((shot) => shot.order)), 0) : userPrompt;
    for (const candidate of rankedCandidates) {
        const idempotencyKey = systemAiIdempotencyKey("drama-lab-extract-storyboards", input.userId, input.project.id, input.episodeId, input.requestId, candidate.channelId, candidate.upstreamModel);
        try {
            let streamedShots = resumeShots;
            let streamBaseShots = resumeShots;
            const saveStreamedPartial = async (argumentsText: string) => {
                if (!input.onPartial || !argumentsText.trim()) return;
                try {
                    const partial = normalizeExtractedDramaLabStoryboardsWithMeta(argumentsText, input.project);
                    const merged = mergeStoryboardShots(streamBaseShots, partial.shots);
                    if (merged.length <= streamedShots.length) return;
                    try {
                        await input.onPartial(merged, { ...partial.meta, truncated: true, recoveredCount: merged.length, continuationAttempts: 0 });
                        streamedShots = merged;
                    } catch {
                        // A checkpoint failure must not discard the valid
                        // upstream response; the final save will retry it.
                    }
                } catch {
                    // A token stream is normally inside an incomplete JSON
                    // object. Final parsing remains authoritative.
                }
            };
            let call = await requestStoryboardText({ input, candidate, systemPrompt, userPrompt: initialPrompt, model, idempotencyKey, onStreamPartial: saveStreamedPartial });
            let initialResponseRefunded = false;
            try {
                let normalized: NormalizedStoryboardResult;
                try {
                    normalized = normalizeExtractedDramaLabStoryboardsWithMeta(call.arguments, input.project);
                } catch (error) {
                    if (!isEmptyStoryboardResult(error)) throw error;
                    // An empty array is a provider/model semantic failure, not
                    // a valid extraction. Refund that response before making
                    // one recovery request with native structured output.
                    await refundInvalidResponse(input.userId, model, call.headers);
                    initialResponseRefunded = true;
                    call = await requestStoryboardText({
                        input,
                        candidate,
                        systemPrompt,
                        userPrompt: buildEmptyStoryboardRetryPrompt(userPrompt),
                        model,
                        idempotencyKey: systemAiIdempotencyKey("drama-lab-extract-storyboards-retry", input.userId, input.project.id, input.episodeId, input.requestId, candidate.channelId, candidate.upstreamModel),
                        preferNativeTools: true,
                        onStreamPartial: saveStreamedPartial,
                    });
                    normalized = normalizeExtractedDramaLabStoryboardsWithMeta(call.arguments, input.project);
                }
                let shots = mergeStoryboardShots(resumeShots, normalized.shots);
                let meta = { ...normalized.meta, continuationAttempts: 0 };
                await input.onPartial?.(shots, meta);

                // A large script can exhaust the model output budget. Continue
                // from the last recovered shot rather than discarding its prefix.
                while (meta.truncated && shots.length > 0 && meta.continuationAttempts < 3) {
                    const attempt = meta.continuationAttempts + 1;
                    const lastOrder = Math.max(...shots.map((shot) => shot.order));
                    const continuationPrompt = buildContinuationPrompt(userPrompt, shots, lastOrder, attempt);
                    try {
                        streamBaseShots = shots;
                        const continuation = await requestStoryboardText({
                            input,
                            candidate,
                            systemPrompt,
                            userPrompt: continuationPrompt,
                            model,
                            idempotencyKey: systemAiIdempotencyKey("drama-lab-extract-storyboards-continuation", input.userId, input.project.id, input.episodeId, input.requestId, String(attempt), candidate.channelId, candidate.upstreamModel),
                            onStreamPartial: saveStreamedPartial,
                        });
                        const next = normalizeExtractedDramaLabStoryboardsWithMeta(continuation.arguments, input.project);
                        const merged = mergeStoryboardShots(shots, next.shots);
                        const added = merged.length - shots.length;
                        shots = merged;
                        meta = {
                            truncated: next.meta.truncated,
                            recoveredCount: shots.length,
                            duplicateCount: meta.duplicateCount + next.meta.duplicateCount + Math.max(0, next.shots.length - added),
                            continuationAttempts: attempt,
                        };
                        await input.onPartial?.(shots, meta);
                        if (added <= 0) break;
                    } catch {
                        // Keep the valid prefix and expose its truncated state so
                        // the caller can offer an explicit retry.
                        meta = { ...meta, continuationAttempts: attempt, truncated: true, recoveredCount: shots.length };
                        await input.onPartial?.(shots, meta);
                        break;
                    }
                }
                await recordDramaLabTextGenerationLog({
                    id: logId,
                    userId: input.userId,
                    projectId: input.project.id,
                    episodeId: input.episodeId,
                    title: "分镜提取",
                    prompt: userPrompt,
                    model,
                    status: "success",
                    durationMs: call.elapsedMs,
                    createdAt: startedAt,
                });
                return { shots, ...meta, templateKeys: [storyboardPrompt.key, outputPrompt.key] as const };
            } catch (error) {
                if (!initialResponseRefunded) await refundInvalidResponse(input.userId, model, call.headers);
                throw error;
            }
        } catch (error) {
            latestError = error;
        }
    }

    await recordDramaLabTextGenerationLog({
        id: logId,
        userId: input.userId,
        projectId: input.project.id,
        episodeId: input.episodeId,
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

async function requestStoryboardText({ input, candidate, systemPrompt, userPrompt, model, idempotencyKey, preferNativeTools = false, onStreamPartial }: StoryboardTextRequestInput) {
    return requestStructuredText({
        origin: input.origin,
        cookie: input.cookie,
        candidate,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
        ],
        tool: extractDramaStoryboardsTool,
        preferNativeTools,
        headers: { "Content-Type": "application/json", ...systemAiBillingHeaders(model, idempotencyKey, candidate.upstreamModel) },
        stream: true,
        onStreamDelta: async (argumentsText) => onStreamPartial?.(argumentsText),
        onInvalidResponse: (headers) => refundInvalidResponse(input.userId, model, headers),
    });
}

function isEmptyStoryboardResult(error: unknown): error is DramaLabStoryboardExtractionError {
    return error instanceof DramaLabStoryboardExtractionError && /没有返回任何分镜|没有返回可恢复的分镜/.test(error.message);
}

function buildEmptyStoryboardRetryPrompt(originalUserPrompt: string) {
    return [
        "上一次模型响应返回了空的 shots 数组，这是无效结果。当前剧本非空，请重新完成分镜拆解。",
        "必须返回至少一个真实镜头；每个镜头严格使用原始请求中的完整字段和项目资产 ID 白名单。",
        "只返回 extract_drama_storyboards 的 JSON 参数，不要返回 slots、metadata、解释文字或 Markdown。",
        `原始请求：${originalUserPrompt}`,
    ].join("\n\n");
}

export function normalizeExtractedDramaLabStoryboards(value: string, project: DramaProject): DramaShot[] {
    return normalizeExtractedDramaLabStoryboardsWithMeta(value, project).shots;
}

export function normalizeExtractedDramaLabStoryboardsWithMeta(value: string, project: DramaProject): NormalizedStoryboardResult {
    const parsed = parseStoryboardPayload(value);
    if (!parsed.payload) throw new DramaLabStoryboardExtractionError("文本模型没有返回有效的分镜提取结果");
    // LocalMiniDrama historically accepted any object wrapper around the
    // storyboard array (`storyboards`, `data`, `result`, etc.). New API
    // gateways also occasionally preserve an empty `shots` field while
    // putting the actual result in a nested envelope. Resolve that variation
    // at the parser edge, before applying the strict asset-ID contract.
    const sourceShots = extractStoryboardArray(parsed.payload);
    if (!sourceShots.length) throw new DramaLabStoryboardExtractionError("文本模型没有返回任何分镜");

    const sceneIds = new Set(project.scenes.map((asset) => asset.id));
    const characterIds = new Set(project.characters.map((asset) => asset.id));
    const propIds = new Set(project.props.map((asset) => asset.id));
    const byOrder = new Map<number, DramaShot>();
    let duplicateCount = 0;
    for (const [index, value] of sourceShots.entries()) {
        let shot: ExtractedStoryboard;
        try {
            shot = parseStoryboard(value, index + 1);
            assertAssetReferences(shot, sceneIds, characterIds, propIds, index + 1);
        } catch (error) {
            // A repaired/truncated tail may contain an incomplete object. Keep
            // the complete prefix; unknown asset IDs must still fail loudly.
            if (error instanceof DramaLabStoryboardExtractionError && /引用了项目中不存在/.test(error.message)) throw error;
            if (parsed.truncated) continue;
            throw error;
        }
        const order = shot.shotNumber > 0 ? shot.shotNumber : index + 1;
        if (byOrder.has(order)) duplicateCount += 1;
        byOrder.set(order, toDramaShot(shot, order));
    }
    const shots = [...byOrder.entries()].sort(([a], [b]) => a - b).map(([, shot]) => shot);
    if (!shots.length) throw new DramaLabStoryboardExtractionError("文本模型没有返回可恢复的分镜");
    return {
        shots,
        meta: { truncated: parsed.truncated, recoveredCount: shots.length, duplicateCount, continuationAttempts: 0 },
    };
}

function toDramaShot(shot: ExtractedStoryboard, order: number): DramaShot {
    return {
        id: `shot_${nanoid()}`,
        order,
        title: shot.title,
        description: shot.description,
        sourceText: shot.sourceText,
        shotBoundary: shot.shotBoundary,
        dialogue: shot.dialogue,
        narration: shot.narration,
        utterances: [],
        imagePrompt: shot.imagePrompt || buildImagePrompt(shot),
        videoPrompt: shot.videoPrompt || buildVideoPrompt(shot),
        cameraMotion: shot.cameraMotion,
        shotType: shot.shotType,
        segmentIndex: shot.segmentIndex,
        segmentTitle: shot.segmentTitle || undefined,
        atmosphere: shot.atmosphere || undefined,
        lightingStyle: shot.lightingStyle || undefined,
        depthOfField: shot.depthOfField || undefined,
        creationMode: shot.creationMode,
        universalSegmentText: shot.universalSegmentText || undefined,
        polishedPrompt: shot.polishedPrompt || undefined,
        cameraAngle: shot.cameraAngle,
        angleH: shot.angleH || undefined,
        angleV: shot.angleV || undefined,
        angleS: shot.angleS || undefined,
        location: shot.location,
        time: shot.time,
        action: shot.action,
        result: shot.result,
        emotion: shot.emotion,
        emotionIntensity: shot.emotionIntensity,
        layoutDescription: shot.layoutDescription,
        continuity: shot.continuity || emptyContinuity(shot.cameraAngle, shot.shotType),
        duration: shot.duration,
        characterIds: shot.characterIds,
        propIds: shot.propIds,
        clueIds: [],
        ...(shot.sceneId ? { sceneId: shot.sceneId } : {}),
    };
}

function mergeStoryboardShots(existing: DramaShot[], incoming: DramaShot[]) {
    const byOrder = new Map(existing.map((shot) => [shot.order, shot]));
    const maxExisting = existing.reduce((max, shot) => Math.max(max, shot.order), 0);
    const incomingOrders = incoming.map((shot) => shot.order);
    const needsOffset = maxExisting > 0 && incomingOrders.length > 0 && incomingOrders.every((order) => order <= maxExisting);
    const offset = needsOffset ? maxExisting : 0;
    for (const shot of incoming) {
        const order = shot.order + offset;
        // Continuations can repeat the last recovered shot while also
        // returning new shots. Keep the durable prefix and append only new
        // orders instead of replacing a previously persisted shot.
        if (byOrder.has(order)) continue;
        byOrder.set(order, offset ? { ...shot, order } : shot);
    }
    return [...byOrder.values()].sort((a, b) => a.order - b.order);
}

function buildContinuationPrompt(originalUserPrompt: string, alreadySaved: DramaShot[], lastShot: number, attempt: number) {
    const summary = alreadySaved.map((shot) => ({ order: shot.order, title: shot.title, sourceText: shot.sourceText })).slice(-40);
    return [
        `Continue storyboard extraction (attempt ${attempt}). The previous response was truncated after shot ${lastShot}.`,
        `Return only a JSON object with a shots array. Start at shotNumber ${lastShot + 1}; never repeat an existing shot.`,
        "Use exactly the same schema and project asset ID whitelist as the original request. Preserve all required fields, including prompts and creation mode.",
        `Already recovered shots: ${JSON.stringify(summary)}`,
        `Original request: ${originalUserPrompt}`,
    ].join("\n\n");
}

function buildImagePrompt(shot: ExtractedStoryboard) {
    return [shot.location, shot.time, shot.shotType, shot.cameraAngle, shot.action, shot.atmosphere, shot.lightingStyle, shot.depthOfField, shot.emotion].filter(Boolean).join("，");
}

function buildVideoPrompt(shot: ExtractedStoryboard) {
    return [shot.action, shot.result, shot.cameraMotion, shot.emotion, shot.universalSegmentText].filter(Boolean).join("；");
}

function parseStoryboard(value: unknown, order: number): ExtractedStoryboard {
    const shot = object(value);
    if (!shot) throw new DramaLabStoryboardExtractionError(`第 ${order} 个分镜不是对象`);
    const title = requiredText(firstValue(shot, "title", "shot_title"), "title", order);
    // Legacy L payloads may omit `description`; derive the canonical value
    // from source/action/result rather than rejecting an otherwise complete
    // storyboard row.
    const sourceTextValue = optionalText(firstValue(shot, "sourceText", "source_text"));
    const description = optionalText(firstValue(shot, "description", "shot_description")) || sourceTextValue || optionalText(firstValue(shot, "action")) || optionalText(firstValue(shot, "result", "outcome")) || title;
    const sourceText = sourceTextValue || description;
    const duration = durationValue(firstValue(shot, "duration", "durationSec", "duration_sec"));
    if (duration <= 0) {
        throw new DramaLabStoryboardExtractionError(`第 ${order} 个分镜的 duration 必须是大于 0 的数字`);
    }
    const angleH = optionalText(firstValue(shot, "angleH", "angle_h"));
    const angleV = optionalText(firstValue(shot, "angleV", "angle_v"));
    const angleS = optionalText(firstValue(shot, "angleS", "angle_s"));
    const cameraAngle = optionalText(firstValue(shot, "cameraAngle", "camera_angle", "angle")) || [angleH, angleV, angleS].filter(Boolean).join("/");
    const creationModeValue = optionalText(firstValue(shot, "creationMode", "creation_mode", "mode"));
    const creationMode = creationModeValue === "universal" || creationModeValue === "universal_omni" ? "universal" : "classic";
    const universalSegmentText = optionalText(firstValue(shot, "universalSegmentText", "universal_segment_text"));
    return {
        shotNumber: positiveInteger(firstValue(shot, "shotNumber", "shot_number", "storyboardNumber", "storyboard_number")),
        title,
        description,
        sourceText,
        shotBoundary: optionalText(firstValue(shot, "shotBoundary", "shot_boundary")),
        dialogue: optionalText(firstValue(shot, "dialogue")),
        narration: optionalText(firstValue(shot, "narration", "voiceover", "voice_over")),
        cameraMotion: optionalText(firstValue(shot, "cameraMotion", "camera_motion", "movement", "camera_movement")),
        cameraAngle,
        shotType: optionalText(firstValue(shot, "shotType", "shot_type", "cameraShotType", "camera_shot_type")),
        location: optionalText(firstValue(shot, "location", "sceneLocation", "scene_location", "sceneDescription", "scene_description")),
        time: optionalText(firstValue(shot, "time", "timeOfDay", "time_of_day")),
        action: optionalText(firstValue(shot, "action")) || description,
        result: optionalText(firstValue(shot, "result", "outcome")),
        emotion: optionalText(firstValue(shot, "emotion")),
        emotionIntensity: numberValue(firstValue(shot, "emotionIntensity", "emotion_intensity")),
        layoutDescription: optionalText(firstValue(shot, "layoutDescription", "layout_description")),
        duration,
        sceneId: optionalText(firstValue(shot, "sceneId", "scene_id")),
        characterIds: requiredIds(firstValue(shot, "characterIds", "character_ids", "characters"), "characterIds", order),
        propIds: requiredIds(firstValue(shot, "propIds", "prop_ids", "props"), "propIds", order),
        segmentIndex: integerValue(firstValue(shot, "segmentIndex", "segment_index")),
        segmentTitle: optionalText(firstValue(shot, "segmentTitle", "segment_title")),
        atmosphere: optionalText(firstValue(shot, "atmosphere")),
        lightingStyle: optionalText(firstValue(shot, "lightingStyle", "lighting_style")),
        depthOfField: optionalText(firstValue(shot, "depthOfField", "depth_of_field")),
        creationMode,
        universalSegmentText: creationMode === "universal" ? universalSegmentText || description : universalSegmentText,
        polishedPrompt: optionalText(firstValue(shot, "polishedPrompt", "polished_prompt")),
        imagePrompt: optionalText(firstValue(shot, "imagePrompt", "image_prompt")),
        videoPrompt: optionalText(firstValue(shot, "videoPrompt", "video_prompt")),
        angleH,
        angleV,
        angleS,
        continuity: parseContinuity(firstValue(shot, "continuity", "continuitySnapshot", "continuity_snapshot")),
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

function firstValue(record: Record<string, unknown>, ...keys: string[]) {
    for (const key of keys) if (record[key] !== undefined && record[key] !== null) return record[key];
    return undefined;
}

function positiveInteger(value: unknown) {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function integerValue(value: unknown) {
    const number = typeof value === "number" ? value : Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function durationValue(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return 0;
    const number = Number(value.trim().replace(/s$/i, ""));
    return Number.isFinite(number) ? number : 0;
}

function parseContinuity(value: unknown): DramaShot["continuity"] | undefined {
    const source = object(value);
    if (!source) return undefined;
    const text = (key: string) => optionalText(source[key]);
    return {
        shotSize: text("shotSize") || text("shot_size"),
        cameraAngle: text("cameraAngle") || text("camera_angle"),
        composition: text("composition"),
        characterBlocking: text("characterBlocking") || text("character_blocking"),
        gazeDirection: text("gazeDirection") || text("gaze_direction"),
        actionStart: text("actionStart") || text("action_start"),
        actionEnd: text("actionEnd") || text("action_end"),
        screenDirection: text("screenDirection") || text("screen_direction"),
        axisRule: text("axisRule") || text("axis_rule"),
        continuityNotes: text("continuityNotes") || text("continuity_notes"),
    };
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

function parseStoryboardPayload(value: string): { payload: Record<string, unknown> | unknown[] | null; truncated: boolean } {
    const cleaned = value
        .replace(/^\uFEFF/u, "")
        .replace(/^```(?:json)?\s*/gim, "")
        .replace(/```\s*$/gim, "")
        .trim();
    const start = Math.min(...[cleaned.indexOf("{"), cleaned.indexOf("[")].filter((index) => index >= 0));
    const candidate = Number.isFinite(start) ? cleaned.slice(start) : cleaned;
    try {
        const parsed = JSON.parse(candidate) as unknown;
        return { payload: object(parsed) || (Array.isArray(parsed) ? parsed : null), truncated: false };
    } catch {
        // jsonrepair handles unterminated strings/arrays and missing closing
        // delimiters. Treat a repaired value as truncated for continuation.
        try {
            const repaired = jsonrepair(candidate);
            const parsed = JSON.parse(repaired) as unknown;
            return { payload: object(parsed) || (Array.isArray(parsed) ? parsed : null), truncated: true };
        } catch {
            const repaired = repairTruncatedArray(candidate);
            if (!repaired) return { payload: null, truncated: false };
            try {
                const parsed = JSON.parse(repaired) as unknown;
                return { payload: object(parsed) || (Array.isArray(parsed) ? parsed : null), truncated: true };
            } catch {
                return { payload: null, truncated: false };
            }
        }
    }
}

function repairTruncatedArray(value: string) {
    const trimmed = value.trim();
    const start = trimmed.indexOf("[");
    if (start < 0) return "";
    const body = trimmed.slice(start);
    const lastObject = body.lastIndexOf("}");
    if (lastObject < 0) return "";
    return `${body.slice(0, lastObject + 1).replace(/,\s*$/, "")}]`;
}

function object(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

const STORYBOARD_ARRAY_KEYS = ["shots", "storyboards", "storyboard", "shotList", "shot_list", "segments", "items", "data", "result", "分镜"] as const;

function extractStoryboardArray(value: Record<string, unknown> | unknown[] | null): unknown[] {
    if (Array.isArray(value)) return value;
    if (!value) return [];

    const visited = new Set<object>();
    const preferred: unknown[][] = [];
    const fallback: unknown[][] = [];

    const visit = (current: unknown, depth: number) => {
        if (Array.isArray(current)) {
            if (current.length > 0 && current.every((item) => isLikelyStoryboard(item))) preferred.push(current);
            else if (current.length > 0) fallback.push(current);
            return;
        }
        const recordValue = object(current);
        if (!recordValue || depth > 4 || visited.has(recordValue)) return;
        visited.add(recordValue);

        for (const [childKey, child] of Object.entries(recordValue)) {
            if (Array.isArray(child)) {
                if (STORYBOARD_ARRAY_KEYS.includes(childKey as (typeof STORYBOARD_ARRAY_KEYS)[number])) {
                    if (child.length > 0 && child.every((item) => isLikelyStoryboard(item))) preferred.push(child);
                    else if (child.length > 0) fallback.push(child);
                } else if (child.length > 0 && child.every((item) => isLikelyStoryboard(item))) {
                    preferred.push(child);
                }
            } else if (STORYBOARD_ARRAY_KEYS.includes(childKey as (typeof STORYBOARD_ARRAY_KEYS)[number]) || depth < 2) {
                visit(child, depth + 1);
            }
        }
    };

    visit(value, 0);
    // Prefer an array whose records look like shots. The fallback is retained
    // for legacy payloads where the provider used an arbitrary wrapper key.
    return preferred[0] || fallback[0] || [];
}

function isLikelyStoryboard(value: unknown) {
    const recordValue = object(value);
    if (!recordValue) return false;
    const keys = Object.keys(recordValue);
    const markers = [
        "shotNumber",
        "shot_number",
        "storyboardNumber",
        "storyboard_number",
        "shotBoundary",
        "shot_boundary",
        "cameraAngle",
        "camera_angle",
        "cameraMotion",
        "camera_motion",
        "imagePrompt",
        "image_prompt",
        "sceneId",
        "scene_id",
        "characterIds",
        "character_ids",
        "propIds",
        "prop_ids",
        "duration",
        "action",
    ];
    return keys.filter((key) => markers.includes(key)).length >= 2;
}

async function refundInvalidResponse(userId: string, model: string, headers: Headers) {
    const billing = readSystemAiBilling(headers);
    if (hasSystemAiCharge(billing)) await refundGenerationCharge({ userId, receiptId: billing.billingReceiptId, model, usageKind: "text", units: 1, idempotencyKey: `drama-lab-refund:${billing.billingReceiptId}` });
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
                        shotNumber: { type: "integer", minimum: 1 },
                        title: { type: "string" },
                        description: { type: "string" },
                        sourceText: { type: "string" },
                        shotBoundary: { type: "string" },
                        segmentIndex: { type: "integer", minimum: 0 },
                        segmentTitle: { type: "string" },
                        dialogue: { type: "string" },
                        narration: { type: "string" },
                        cameraMotion: { type: "string" },
                        cameraAngle: { type: "string" },
                        angleH: { type: "string" },
                        angleV: { type: "string" },
                        angleS: { type: "string" },
                        shotType: { type: "string" },
                        location: { type: "string" },
                        time: { type: "string" },
                        action: { type: "string" },
                        result: { type: "string" },
                        emotion: { type: "string" },
                        emotionIntensity: { type: "number" },
                        atmosphere: { type: "string" },
                        lightingStyle: { type: "string" },
                        depthOfField: { type: "string" },
                        layoutDescription: { type: "string" },
                        duration: { type: "number" },
                        creationMode: { type: "string", enum: ["classic", "universal"] },
                        universalSegmentText: { type: "string" },
                        polishedPrompt: { type: "string" },
                        imagePrompt: { type: "string" },
                        videoPrompt: { type: "string" },
                        continuity: {
                            type: "object",
                            properties: {
                                shotSize: { type: "string" },
                                cameraAngle: { type: "string" },
                                composition: { type: "string" },
                                characterBlocking: { type: "string" },
                                gazeDirection: { type: "string" },
                                actionStart: { type: "string" },
                                actionEnd: { type: "string" },
                                screenDirection: { type: "string" },
                                axisRule: { type: "string" },
                                continuityNotes: { type: "string" },
                            },
                            required: ["shotSize", "cameraAngle", "composition", "characterBlocking", "gazeDirection", "actionStart", "actionEnd", "screenDirection", "axisRule", "continuityNotes"],
                            additionalProperties: false,
                        },
                        sceneId: { type: "string" },
                        characterIds: { type: "array", items: { type: "string" } },
                        propIds: { type: "array", items: { type: "string" } },
                    },
                    required: [
                        "shotNumber",
                        "title",
                        "description",
                        "sourceText",
                        "shotBoundary",
                        "segmentIndex",
                        "segmentTitle",
                        "dialogue",
                        "narration",
                        "cameraMotion",
                        "cameraAngle",
                        "angleH",
                        "angleV",
                        "angleS",
                        "shotType",
                        "location",
                        "time",
                        "action",
                        "result",
                        "emotion",
                        "emotionIntensity",
                        "atmosphere",
                        "lightingStyle",
                        "depthOfField",
                        "layoutDescription",
                        "duration",
                        "creationMode",
                        "universalSegmentText",
                        "polishedPrompt",
                        "imagePrompt",
                        "videoPrompt",
                        "continuity",
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
