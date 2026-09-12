import { validateDramaLabUniversalVideoPrompt } from "@/lib/drama-lab-universal-video";
import { resolveDramaLabStylePrompt, renderDramaLabFrameTemplate } from "@/lib/drama-lab-style-prompt";
import type { DramaAssetReference, DramaEpisode, DramaProject, DramaShot, DramaShotFrameSource, DramaShotFrameType, DramaShotGenerationHistory, DramaShotVideoFrameSnapshot } from "@/lib/drama-project-contract";
import { dramaAssetPrimaryReference, dramaShotAssetReferences } from "@/lib/drama-asset-references";
import { resolveDramaLabPrompt, withDramaLabPromptContract } from "@/lib/server/drama-lab-prompt-template-service";
import { DramaProjectStoreError, getDramaProject, updateDramaProject } from "@/lib/server/drama-project-store";
import type { VideoReferenceRole } from "@/lib/video-reference-contract";

export class DramaLabShotGenerationError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
    }
}

type ShotContext = {
    episode: DramaEpisode;
    shot: DramaShot;
};

export type DramaLabGenerationReference = Pick<DramaAssetReference, "id" | "url" | "storageKey" | "label" | "width" | "height">;

export type DramaLabVideoGenerationReference = DramaLabGenerationReference & {
    role: VideoReferenceRole;
    frameType?: DramaShotFrameType;
    taskId?: string;
    source?: DramaShotFrameSource;
    sourceVideoTaskId?: string;
    sourceShotId?: string;
    sourceVideoHistoryId?: string;
};

export type DramaLabStoryboardVideoOptions = {
    model?: string;
    supportsReferenceImages?: boolean;
    supportsFirstFrame?: boolean;
    supportsLastFrame?: boolean;
    maxReferenceImages?: number;
};

export type DramaLabMissingAssetReference = {
    type: "scene" | "character" | "prop";
    id: string;
    name: string;
};

export async function prepareDramaLabStoryboardImage(project: DramaProject, episodeId: string, shotId: string) {
    const context = findShot(project, episodeId, shotId);
    assertProjectAssetBindings(project, context.shot);
    assertDramaLabShotAssetReferences(project, context.shot);
    const template = await resolveDramaLabPrompt("key_frame_prompt");
    const references = shotReferences(project, context.shot);
    return {
        prompt: withDramaLabPromptContract(
            `${renderDramaLabFrameTemplate(template.template, project)}\n\n${shotGenerationContext(project, context.episode, context.shot)}\n\n【经典单图最终提示词】\n${context.shot.polishedPrompt?.trim() || context.shot.imagePrompt?.trim() || context.shot.description || context.shot.sourceText}`,
            "这是关键帧图像生成任务。只呈现当前镜头已绑定的场景、角色和道具；不得加入未绑定角色、未绑定道具、文字、水印或项目外主体。参考图只用于保持已绑定资产的身份、外观、比例和空间关系，不得改变其归属。",
        ),
        references,
        templateKey: template.key,
        shot: context.shot,
    };
}

export function prepareDramaLabStoryboardVideo(project: DramaProject, episodeId: string, shotId: string, options: DramaLabStoryboardVideoOptions = {}) {
    const context = findShot(project, episodeId, shotId);
    assertProjectAssetBindings(project, context.shot);
    if (context.shot.creationMode === "universal") return prepareUniversalVideo(project, context, options);
    const firstLastEnabled = context.shot.storyboardFrameMode !== "single";
    const firstFrame = firstLastEnabled ? context.shot.frames?.first : undefined;
    const keyFrame = context.shot.frames?.key;
    const lastFrame = firstLastEnabled ? context.shot.frames?.last : undefined;
    const visualSource = keyFrame?.url
        ? {
              id: `key-frame-${context.shot.id}`,
              url: keyFrame.url,
              label: `${context.shot.title}关键帧`,
              width: keyFrame.width,
              height: keyFrame.height,
              taskId: keyFrame.taskId,
          }
        : context.shot.storyboardImageUrl
          ? {
                id: `storyboard-${context.shot.id}`,
                url: context.shot.storyboardImageUrl,
                label: `${context.shot.title}分镜图`,
                width: context.shot.storyboardImageWidth,
                height: context.shot.storyboardImageHeight,
                taskId: context.shot.storyboardTaskId,
            }
          : undefined;
    if (!visualSource) throw new DramaLabShotGenerationError("请先生成当前镜头的关键帧或分镜图");
    const visualPrompt = context.shot.videoPrompt.trim() || defaultVideoPrompt(context.shot);
    // Capability is opt-in: callers that have not resolved a provider must not
    // accidentally submit a frame role to an endpoint that only accepts a
    // generic reference image. The direct service default still keeps a first
    // frame (the common image-to-video contract); routes with a resolved model
    // pass an explicit capability decision.
    const supportsFirstFrame = options.supportsFirstFrame !== false;
    const supportsLastFrame = supportsFirstFrame && options.supportsLastFrame === true;
    const maxReferenceImages = positiveReferenceLimit(options.maxReferenceImages);
    const fallbackReasons: string[] = [];
    if (firstFrame?.url && !supportsFirstFrame) fallbackReasons.push("当前视频模型不支持显式首帧输入，已使用关键帧/分镜图参考");
    if (lastFrame?.url && !firstFrame?.url) fallbackReasons.push("尾帧输入必须同时提供首帧，已省略尾帧");
    if (lastFrame?.url && firstFrame?.url && !supportsLastFrame) fallbackReasons.push("当前视频模型不支持尾帧输入，已降级为首帧/关键帧模式");
    const allReferences = [
        firstFrame?.url && supportsFirstFrame ? frameReference(context.shot, firstFrame, "first", "first_frame") : undefined,
        lastFrame?.url && firstFrame?.url && supportsLastFrame ? frameReference(context.shot, lastFrame, "last", "last_frame") : undefined,
        frameReference(context.shot, keyFrame, "key", "reference", visualSource),
    ].filter((reference): reference is DramaLabVideoGenerationReference => Boolean(reference));
    const references = limitVideoReferences(allReferences, maxReferenceImages, fallbackReasons);
    const frameSnapshot: DramaShotVideoFrameSnapshot = {
        capturedAt: new Date().toISOString(),
        model: options.model?.trim() || undefined,
        supportsFirstFrame,
        supportsLastFrame,
        maxReferenceImages,
        fallbackReason: fallbackReasons.length ? fallbackReasons.join("；") : undefined,
        references: references.map(({ role, frameType, url, storageKey, taskId, source, sourceVideoTaskId, sourceShotId, sourceVideoHistoryId }) => ({
            role,
            frameType,
            url,
            storageKey,
            taskId,
            source,
            sourceVideoTaskId,
            sourceShotId,
            sourceVideoHistoryId,
        })),
    };
    return {
        prompt: [
            "【短剧实验室分镜视频任务】",
            shotGenerationContext(project, context.episode, context.shot),
            `动态要求：${visualPrompt}`,
            context.shot.frames?.first?.prompt ? `首帧状态：${context.shot.frames.first.prompt}` : "",
            context.shot.frames?.last?.prompt ? `尾帧状态：${context.shot.frames.last.prompt}` : "",
            "【不可编辑执行约束】仅使用当前镜头绑定的场景、角色和道具，以及当前分镜图作为画面依据。保持角色身份、服装、场景空间、道具尺度、视线和运动方向一致；不得出现未绑定角色、项目外物体、字幕或水印。",
        ].join("\n\n"),
        visiblePrompt: visualPrompt,
        references,
        parentTaskId: visualSource.taskId,
        frameSnapshot,
        shot: context.shot,
    };
}

function prepareUniversalVideo(project: DramaProject, { episode, shot }: ShotContext, options: DramaLabStoryboardVideoOptions) {
    if (options.supportsReferenceImages !== true) throw new DramaLabShotGenerationError("当前视频渠道未确认支持全能模式普通参考图，请选择支持参考图的视频模型；不会静默改用经典模式");
    assertDramaLabShotAssetReferences(project, shot);
    const owners = [project.scenes.find((asset) => asset.id === shot.sceneId), ...shot.characterIds.map((id) => project.characters.find((asset) => asset.id === id)), ...shot.propIds.map((id) => project.props.find((asset) => asset.id === id))].filter(
        (asset) => Boolean(asset),
    );
    const seen = new Set<string>();
    const references: DramaLabVideoGenerationReference[] = [];
    for (const asset of owners) {
        if (!asset) continue;
        const ref = dramaAssetPrimaryReference(asset);
        if (!ref) continue;
        if (seen.has(ref.url)) throw new DramaLabShotGenerationError("多个资产共用同一参考图，可能导致全能图片编号错位，请核对资产参考图后重试");
        seen.add(ref.url);
        references.push({ id: ref.id, url: ref.url, storageKey: ref.storageKey, label: asset.name, width: ref.width, height: ref.height, role: "reference" });
    }
    if (!references.length) throw new DramaLabShotGenerationError("全能模式至少需要一张已绑定资产或分镜参考图");
    const limit = positiveReferenceLimit(options.maxReferenceImages);
    if (limit && references.length > limit) throw new DramaLabShotGenerationError(`当前视频模型最多接受 ${limit} 张参考图，但本镜需要 ${references.length} 张；不能截断导致图片编号错位`);
    const visiblePrompt = shot.universalSegmentText?.trim() || "";
    try {
        validateDramaLabUniversalVideoPrompt(visiblePrompt, shot.duration, references.length);
    } catch (error) {
        throw new DramaLabShotGenerationError(error instanceof Error ? error.message : "全能提示词不符合格式");
    }
    const frameSnapshot: DramaShotVideoFrameSnapshot = {
        capturedAt: new Date().toISOString(),
        model: options.model,
        supportsFirstFrame: false,
        supportsLastFrame: false,
        maxReferenceImages: limit,
        references: references.map(({ role, url, storageKey, taskId, frameType }) => ({ role, url, storageKey, taskId, frameType })),
    };
    return {
        prompt: [
            visiblePrompt,
            "【实际参考图顺序】",
            ...references.map((reference, index) => `@图片${index + 1}：${reference.label}`),
            `项目：${project.title}；剧集：${episode.title}；画幅：${project.ratio}`,
            `风格：${resolveDramaLabStylePrompt(project.style).zh}`,
            "仅使用本镜绑定的参考图，保持身份与真实尺度；禁止未绑定角色、字幕、水印和额外背景音乐。",
        ].join("\n"),
        visiblePrompt,
        references,
        parentTaskId: shot.frames?.key?.taskId || shot.storyboardTaskId,
        frameSnapshot,
        shot,
    };
}

function frameReference(
    shot: DramaShot,
    frame: NonNullable<DramaShot["frames"]>[DramaShotFrameType] | undefined,
    frameType: DramaShotFrameType,
    role: VideoReferenceRole,
    fallback?: { id: string; url: string; label: string; width?: number; height?: number; taskId?: string },
): DramaLabVideoGenerationReference | undefined {
    const url = frame?.url || fallback?.url;
    if (!url) return undefined;
    return {
        id: fallback?.id || `${frameType}-frame-${shot.id}`,
        url,
        storageKey: frame?.storageKey,
        label: fallback?.label || `${shot.title || shot.id}${frameType === "first" ? " 首帧" : frameType === "last" ? " 尾帧" : " 关键帧"}`,
        width: frame?.width || fallback?.width,
        height: frame?.height || fallback?.height,
        role,
        frameType,
        taskId: frame?.taskId || fallback?.taskId,
        source: frame?.source || (fallback ? "generated" : undefined),
        sourceVideoTaskId: frame?.sourceVideoTaskId,
        sourceShotId: frame?.sourceShotId,
        sourceVideoHistoryId: frame?.sourceVideoHistoryId,
    };
}

function positiveReferenceLimit(value: number | undefined) {
    const limit = Math.floor(Number(value));
    return Number.isFinite(limit) && limit > 0 ? limit : undefined;
}

/**
 * Keep explicit frame roles ahead of ordinary references. A provider's
 * maxReferenceImages applies to the complete image list, so silently sending
 * three images to a one-image endpoint merely causes an avoidable fallback.
 */
function limitVideoReferences(references: DramaLabVideoGenerationReference[], max: number | undefined, fallbackReasons: string[]) {
    if (!max || references.length <= max) return references;
    const first = references.find((reference) => reference.role === "first_frame");
    const last = references.find((reference) => reference.role === "last_frame");
    const regular = references.filter((reference) => reference.role === "reference");
    const selected: DramaLabVideoGenerationReference[] = [];
    if (first && selected.length < max) selected.push(first);
    if (last && selected.length < max) selected.push(last);
    for (const reference of regular) {
        if (selected.length >= max) break;
        selected.push(reference);
    }
    if (last && !selected.includes(last)) fallbackReasons.push(`当前视频模型最多接受 ${max} 张参考图，已省略尾帧输入`);
    const droppedRegular = regular.some((reference) => !selected.includes(reference));
    if (droppedRegular) fallbackReasons.push(`当前视频模型最多接受 ${max} 张参考图，已省略普通关键帧参考图`);
    return selected;
}

export function findShot(project: DramaProject, episodeId: string, shotId: string): ShotContext {
    const episode = project.episodes.find((item) => item.id === episodeId);
    if (!episode) throw new DramaLabShotGenerationError("当前剧集不存在", 404);
    const shot = episode.shots.find((item) => item.id === shotId);
    if (!shot) throw new DramaLabShotGenerationError("当前分镜不存在", 404);
    return { episode, shot };
}

export function updateDramaLabShot(project: DramaProject, episodeId: string, shotId: string, patch: Partial<DramaShot>) {
    let found = false;
    const episodes = project.episodes.map((episode) => {
        if (episode.id !== episodeId) return episode;
        const shots = episode.shots.map((shot) => {
            if (shot.id !== shotId) return shot;
            found = true;
            return { ...shot, ...patch };
        });
        return { ...episode, shots };
    });
    if (!found) throw new DramaLabShotGenerationError("当前分镜不存在", 404);
    return { ...project, episodes, updatedAt: new Date().toISOString() };
}

/**
 * A generation task may finish creating while the user autosaves another part
 * of the project. Reapply only the task-owned shot fields to the latest copy
 * once so that the task ID remains reachable for later synchronization.
 */
export async function persistDramaLabShotUpdate(input: { userId: string; project: DramaProject; episodeId: string; shotId: string; patch: Partial<DramaShot>; retryOnConflict?: boolean; projectOwnerUserId?: string }) {
    // `userId` identifies the actor/task and remains unchanged for billing,
    // task ownership and media checks. Project aggregates, however, are stored
    // under the collaboration group's owner, so member requests must provide
    // that owner identity for the optimistic project write.
    const projectStorageUserId = input.projectOwnerUserId || input.userId;
    const persist = async (project: DramaProject) => {
        const updated = updateDramaLabShot(project, input.episodeId, input.shotId, input.patch);
        await updateDramaProject(projectStorageUserId, updated, project.updatedAt);
        return updated;
    };

    try {
        return await persist(input.project);
    } catch (error) {
        if (input.retryOnConflict === false) throw error;
        if (!(error instanceof DramaProjectStoreError) || error.status !== 409) throw error;
        const latest = await getDramaProject(input.project.id, projectStorageUserId);
        if (!latest) throw new DramaLabShotGenerationError("短剧项目不存在", 404);
        return persist(latest);
    }
}

export function appendDramaLabGenerationHistory(history: DramaShotGenerationHistory[] | undefined, entry: DramaShotGenerationHistory) {
    const existing = (history || []).filter((item) => item.taskId !== entry.taskId);
    return [...existing, entry].slice(-20);
}

export function shotReferences(project: DramaProject, shot: DramaShot): DramaLabGenerationReference[] {
    return dramaShotAssetReferences(project, shot).map((reference) => ({
        id: reference.id,
        url: reference.url,
        storageKey: reference.storageKey,
        label: reference.label,
        width: reference.width,
        height: reference.height,
    }));
}

export function missingDramaLabShotAssetReferences(project: DramaProject, shot: DramaShot): DramaLabMissingAssetReference[] {
    const missing: DramaLabMissingAssetReference[] = [];
    const check = (
        type: DramaLabMissingAssetReference["type"],
        asset:
            | {
                  id: string;
                  name: string;
                  references?: DramaAssetReference[];
                  primaryReferenceId?: string;
                  referenceImageUrl?: string;
                  referenceStorageKey?: string;
              }
            | undefined,
    ) => {
        if (!asset || dramaAssetPrimaryReference(asset)) return;
        missing.push({ type, id: asset.id, name: asset.name });
    };

    check("scene", shot.sceneId ? project.scenes.find((asset) => asset.id === shot.sceneId) : undefined);
    shot.characterIds.forEach((id) =>
        check(
            "character",
            project.characters.find((asset) => asset.id === id),
        ),
    );
    shot.propIds.forEach((id) =>
        check(
            "prop",
            project.props.find((asset) => asset.id === id),
        ),
    );
    return missing;
}

export function assertDramaLabShotAssetReferences(project: DramaProject, shot: DramaShot) {
    const missing = missingDramaLabShotAssetReferences(project, shot);
    if (!missing.length) return;
    const labels = missing.map((item) => `${assetTypeLabel(item.type)}「${item.name}」`).join("、");
    throw new DramaLabShotGenerationError(`当前分镜绑定的资产缺少主参考图：${labels}。请先在资产准备中生成或添加参考图。`, 422);
}

function assertProjectAssetBindings(project: DramaProject, shot: DramaShot) {
    if (shot.sceneId && !project.scenes.some((asset) => asset.id === shot.sceneId)) throw new DramaLabShotGenerationError("分镜关联了当前项目不存在的场景");
    const unknownCharacter = shot.characterIds.find((id) => !project.characters.some((asset) => asset.id === id));
    if (unknownCharacter) throw new DramaLabShotGenerationError("分镜关联了当前项目不存在的角色");
    const unknownProp = shot.propIds.find((id) => !project.props.some((asset) => asset.id === id));
    if (unknownProp) throw new DramaLabShotGenerationError("分镜关联了当前项目不存在的道具");
}

function assetTypeLabel(type: DramaLabMissingAssetReference["type"]) {
    return type === "scene" ? "场景" : type === "character" ? "角色" : "道具";
}

function shotGenerationContext(project: DramaProject, episode: DramaEpisode, shot: DramaShot) {
    const scene = project.scenes.find((asset) => asset.id === shot.sceneId);
    const characters = shot.characterIds.flatMap((id) => project.characters.find((asset) => asset.id === id) || []);
    const props = shot.propIds.flatMap((id) => project.props.find((asset) => asset.id === id) || []);
    const asset = (item: { name: string; description: string }) => `${item.name}${item.description ? `：${item.description}` : ""}`;
    return [
        "【当前项目与镜头上下文】",
        `项目：${project.title}`,
        `剧集：${episode.title}`,
        `统一风格：${project.style || "未设置"}`,
        `风格正文（中文）：${resolveDramaLabStylePrompt(project.style).zh}`,
        `风格正文（英文）：${resolveDramaLabStylePrompt(project.style).en}`,
        `画幅比例：${project.ratio}`,
        `分镜：${shot.title}`,
        `镜头内容：${shot.description || shot.sourceText}`,
        shot.shotType ? `景别：${shot.shotType}` : "",
        shot.location ? `地点：${shot.location}` : "",
        shot.time ? `时间：${shot.time}` : "",
        shot.action ? `动作：${shot.action}` : "",
        shot.result ? `动作结果：${shot.result}` : "",
        shot.emotion ? `情绪：${shot.emotion}（强度 ${shot.emotionIntensity ?? 0}）` : "",
        shot.layoutDescription ? `空间布局锚点：${shot.layoutDescription}` : "",
        shot.dialogue ? `对白：${shot.dialogue}` : "",
        shot.narration ? `旁白：${shot.narration}` : "",
        shot.cameraMotion ? `运镜：${shot.cameraMotion}` : "",
        shot.continuity?.cameraAngle ? `机位：${shot.continuity.cameraAngle}` : "",
        shot.polishedPrompt ? "" : shot.imagePrompt ? `用户画面补充：${shot.imagePrompt}` : "",
        `场景白名单：${scene ? `${asset(scene)}；视觉锚点：${scene.profile?.visualIdentity || "无"}` : "无"}`,
        `角色白名单：${characters.length ? characters.map((item) => `${asset(item)}；视觉锚点：${item.profile?.visualIdentity || "无"}；造型：${item.profile?.styling || "无"}`).join("；") : "无"}`,
        `道具白名单：${props.length ? props.map((item) => `${asset(item)}；视觉锚点：${item.profile?.visualIdentity || "无"}`).join("；") : "无"}`,
    ]
        .filter(Boolean)
        .join("\n");
}

function defaultVideoPrompt(shot: DramaShot) {
    return [shot.description || shot.sourceText, shot.cameraMotion, `在 ${shot.duration} 秒内完成自然连续的动作变化`].filter(Boolean).join("；");
}
