import type { DramaAssetReference, DramaEpisode, DramaProject, DramaShot, DramaShotGenerationHistory } from "@/lib/drama-project-contract";
import { dramaShotAssetReferences } from "@/lib/drama-asset-references";
import { resolveDramaLabPrompt, withDramaLabPromptContract } from "@/lib/server/drama-lab-prompt-template-service";
import { DramaProjectStoreError, getDramaProject, updateDramaProject } from "@/lib/server/drama-project-store";

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

export async function prepareDramaLabStoryboardImage(project: DramaProject, episodeId: string, shotId: string) {
    const context = findShot(project, episodeId, shotId);
    assertProjectAssetBindings(project, context.shot);
    const template = await resolveDramaLabPrompt("key_frame_prompt");
    const references = shotReferences(project, context.shot);
    return {
        prompt: withDramaLabPromptContract(
            `${template.template}\n\n${shotGenerationContext(project, context.episode, context.shot)}`,
            "这是关键帧图像生成任务。只呈现当前镜头已绑定的场景、角色和道具；不得加入未绑定角色、未绑定道具、文字、水印或项目外主体。参考图只用于保持已绑定资产的身份、外观、比例和空间关系，不得改变其归属。",
        ),
        references,
        templateKey: template.key,
        shot: context.shot,
    };
}

export function prepareDramaLabStoryboardVideo(project: DramaProject, episodeId: string, shotId: string) {
    const context = findShot(project, episodeId, shotId);
    assertProjectAssetBindings(project, context.shot);
    const keyFrame = context.shot.frames?.key;
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
    const frameReferences = ["first", "last"].flatMap((frameType) => {
        const frame = context.shot.frames?.[frameType as "first" | "key" | "last"];
        return frame?.url ? [{ id: `${frameType}-frame-${context.shot.id}`, url: frame.url, label: `${context.shot.title}${frameType} frame`, width: frame.width, height: frame.height }] : [];
    });
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
        references: [
            {
                id: visualSource.id,
                url: visualSource.url,
                label: visualSource.label,
                width: visualSource.width,
                height: visualSource.height,
            },
            ...frameReferences,
            ...shotReferences(project, context.shot),
        ],
        parentTaskId: visualSource.taskId,
        shot: context.shot,
    };
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
export async function persistDramaLabShotUpdate(input: { userId: string; project: DramaProject; episodeId: string; shotId: string; patch: Partial<DramaShot> }) {
    const persist = async (project: DramaProject) => {
        const updated = updateDramaLabShot(project, input.episodeId, input.shotId, input.patch);
        await updateDramaProject(input.userId, updated, project.updatedAt);
        return updated;
    };

    try {
        return await persist(input.project);
    } catch (error) {
        if (!(error instanceof DramaProjectStoreError) || error.status !== 409) throw error;
        const latest = await getDramaProject(input.project.id, input.userId);
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

function assertProjectAssetBindings(project: DramaProject, shot: DramaShot) {
    if (shot.sceneId && !project.scenes.some((asset) => asset.id === shot.sceneId)) throw new DramaLabShotGenerationError("分镜关联了当前项目不存在的场景");
    const unknownCharacter = shot.characterIds.find((id) => !project.characters.some((asset) => asset.id === id));
    if (unknownCharacter) throw new DramaLabShotGenerationError("分镜关联了当前项目不存在的角色");
    const unknownProp = shot.propIds.find((id) => !project.props.some((asset) => asset.id === id));
    if (unknownProp) throw new DramaLabShotGenerationError("分镜关联了当前项目不存在的道具");
}

function shotGenerationContext(project: DramaProject, episode: DramaEpisode, shot: DramaShot) {
    const scene = project.scenes.find((asset) => asset.id === shot.sceneId);
    const characters = shot.characterIds.flatMap((id) => project.characters.find((asset) => asset.id === id) || []);
    const props = shot.propIds.flatMap((id) => project.props.find((asset) => asset.id === id) || []);
    const asset = (item: { id: string; name: string; description: string }) => `${item.id} / ${item.name}${item.description ? `：${item.description}` : ""}`;
    return [
        "【当前项目与镜头上下文】",
        `项目：${project.title}`,
        `剧集：${episode.title}`,
        `统一风格：${project.style || "未设置"}`,
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
        shot.imagePrompt ? `用户画面补充：${shot.imagePrompt}` : "",
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
