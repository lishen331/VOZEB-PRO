import type { DramaEpisode, DramaProject, DramaShot } from "@/lib/drama-project-contract";

export class OneClickShotCrudError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
    }
}

/**
 * L `storyboardService.updateStoryboard` 的 allowed 白名单，逐项映射到 V 的 DramaShot 字段。
 * 白名单之外的键一律忽略 —— L 就是这个语义，不能让调用方写入任意字段。
 */
const EDITABLE_FIELDS = [
    "title",
    "description",
    "location",
    "time",
    "duration",
    "dialogue",
    "narration",
    "action",
    "result",
    "atmosphere",
    "imagePrompt",
    "polishedPrompt",
    "videoPrompt",
    "sceneId",
    "videoUrl",
    "shotType",
    "cameraAngle",
    "angleH",
    "angleV",
    "angleS",
    "cameraMotion",
    // L `batchInferParams` 会推断并写入这两项（连同 movement/cameraMotion）。
    // 不放进白名单，批量推断的结果就存不下来。
    "lightingStyle",
    "depthOfField",
    "segmentIndex",
    "segmentTitle",
    "creationMode",
    // L 的经典/首尾帧切换靠这个字段：prepareDramaLabStoryboardVideo 用
    // `storyboardFrameMode !== "single"` 判定是否启用首尾帧。不放进白名单，
    // 前端切模式就存不下来。
    "storyboardFrameMode",
    // 序列图模式（四宫格/九宫格）：不放进白名单，前端选了模式也存不下来，
    // 生图时就拿不到它，拆图链路等于永不触发。
    "storyboardSequenceMode",
    "universalSegmentText",
    "layoutDescription",
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];
const EDITABLE = new Set<string>(EDITABLE_FIELDS);

export type OneClickShotPatch = Partial<Pick<DramaShot, EditableField>> & {
    characterIds?: string[];
    propIds?: string[];
};

function locateEpisode(project: DramaProject, episodeId: string): DramaEpisode {
    const episode = project.episodes.find((item) => item.id === episodeId);
    if (!episode) throw new OneClickShotCrudError("分集不存在", 404);
    return episode;
}

/** L 的 storyboard_number 是 1 起的连续序号；V 用 order 承载，重排后必须重新连续编号。 */
function renumber(shots: DramaShot[]): DramaShot[] {
    return shots.map((shot, index) => (shot.order === index + 1 ? shot : { ...shot, order: index + 1 }));
}

function withEpisodeShots(project: DramaProject, episodeId: string, shots: DramaShot[]): DramaProject {
    return { ...project, episodes: project.episodes.map((item) => (item.id === episodeId ? { ...item, shots } : item)) };
}

/** 仅接受项目内真实资产 ID：规范禁止用名称猜 ID，也禁止生成幽灵资产。 */
function assertAssetIds(project: DramaProject, patch: OneClickShotPatch) {
    if (patch.characterIds) {
        const unknown = patch.characterIds.filter((id) => !project.characters.some((asset) => asset.id === id));
        if (unknown.length) throw new OneClickShotCrudError(`角色不存在：${unknown.join("、")}`);
    }
    if (patch.propIds) {
        const unknown = patch.propIds.filter((id) => !project.props.some((asset) => asset.id === id));
        if (unknown.length) throw new OneClickShotCrudError(`道具不存在：${unknown.join("、")}`);
    }
    if (patch.sceneId && !project.scenes.some((asset) => asset.id === patch.sceneId)) {
        throw new OneClickShotCrudError(`场景不存在：${patch.sceneId}`);
    }
}

export function createOneClickShot(project: DramaProject, episodeId: string, input: OneClickShotPatch = {}): { project: DramaProject; shot: DramaShot } {
    const episode = locateEpisode(project, episodeId);
    assertAssetIds(project, input);
    const shot: DramaShot = {
        id: `shot-${crypto.randomUUID()}`,
        order: episode.shots.length + 1,
        title: "",
        description: "",
        sourceText: "",
        shotBoundary: "",
        dialogue: "",
        narration: "",
        utterances: [],
        imagePrompt: "",
        videoPrompt: "",
        cameraMotion: "",
        duration: 0,
        characterIds: [],
        propIds: [],
        clueIds: [],
        // L createStoryboard 落库即 status='pending'
        storyboardStatus: "pending",
        creationMode: "classic",
        ...pickEditable(input),
        ...(input.characterIds ? { characterIds: input.characterIds } : {}),
        ...(input.propIds ? { propIds: input.propIds } : {}),
    };
    const shots = renumber([...episode.shots, shot]);
    return { project: withEpisodeShots(project, episodeId, shots), shot: shots[shots.length - 1] };
}

/**
 * L `insertBeforeStoryboard`：把目标及其后所有分镜序号 +1，然后在目标位插入一条空白分镜，
 * 并继承目标的 segment_index / segment_title，状态为 pending。
 */
export function insertOneClickShotBefore(project: DramaProject, episodeId: string, targetShotId: string): { project: DramaProject; shot: DramaShot } {
    const episode = locateEpisode(project, episodeId);
    const index = episode.shots.findIndex((item) => item.id === targetShotId);
    if (index < 0) throw new OneClickShotCrudError("目标分镜不存在", 404);
    const target = episode.shots[index];
    const inserted: DramaShot = {
        id: `shot-${crypto.randomUUID()}`,
        order: target.order,
        title: "",
        description: "",
        sourceText: "",
        shotBoundary: "",
        dialogue: "",
        narration: "",
        utterances: [],
        imagePrompt: "",
        videoPrompt: "",
        cameraMotion: "",
        duration: 0,
        characterIds: [],
        propIds: [],
        clueIds: [],
        storyboardStatus: "pending",
        creationMode: "classic",
        ...(target.segmentIndex === undefined ? {} : { segmentIndex: target.segmentIndex }),
        ...(target.segmentTitle === undefined ? {} : { segmentTitle: target.segmentTitle }),
    };
    const shots = renumber([...episode.shots.slice(0, index), inserted, ...episode.shots.slice(index)]);
    return { project: withEpisodeShots(project, episodeId, shots), shot: shots[index] };
}

function pickEditable(patch: OneClickShotPatch): Partial<DramaShot> {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
        if (EDITABLE.has(key) && value !== undefined) next[key] = value;
    }
    return next as Partial<DramaShot>;
}

/**
 * L `updateStoryboard`：只写白名单字段；角色/道具关联整体替换。
 * 注意 L 明确「角色勾选变更不删除 frame_prompts」—— 所以这里绝不能清空 frames。
 */
export function updateOneClickShot(project: DramaProject, episodeId: string, shotId: string, patch: OneClickShotPatch): { project: DramaProject; shot: DramaShot } {
    const episode = locateEpisode(project, episodeId);
    const existing = episode.shots.find((item) => item.id === shotId);
    if (!existing) throw new OneClickShotCrudError("分镜不存在", 404);
    assertAssetIds(project, patch);
    const next: DramaShot = {
        ...existing,
        ...pickEditable(patch),
        ...(patch.characterIds ? { characterIds: [...patch.characterIds] } : {}),
        ...(patch.propIds ? { propIds: [...patch.propIds] } : {}),
    };
    const shots = episode.shots.map((item) => (item.id === shotId ? next : item));
    return { project: withEpisodeShots(project, episodeId, shots), shot: next };
}

/** L 用 deleted_at 软删；V 无软删列，按矩阵约定直接移除元素并重排序号。 */
export function deleteOneClickShot(project: DramaProject, episodeId: string, shotId: string): DramaProject {
    const episode = locateEpisode(project, episodeId);
    if (!episode.shots.some((item) => item.id === shotId)) throw new OneClickShotCrudError("分镜不存在", 404);
    return withEpisodeShots(project, episodeId, renumber(episode.shots.filter((item) => item.id !== shotId)));
}
