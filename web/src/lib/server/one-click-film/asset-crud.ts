import type { DramaNamedAsset, DramaProject } from "@/lib/drama-project-contract";
import { defaultDramaAssetGenerationLayout } from "@/lib/drama-asset-generation-contract";

import type { OneClickAssetKind } from "./asset-image-service";

export class OneClickAssetCrudError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "OneClickAssetCrudError";
    }
}

/**
 * L `updateStoryboard` 式的白名单思路同样适用于资产：只允许写这些字段，
 * 其余键一律忽略，避免调用方顺手覆盖 references / primaryReferenceId 等由
 * 参考图链路独占维护的状态。
 */
const EDITABLE_FIELDS = ["name", "description", "appearance", "imagePrompt", "polishedPrompt", "singleImagePrompt", "generationLayout", "role", "type", "time"] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];
const EDITABLE = new Set<string>(EDITABLE_FIELDS);

export type OneClickAssetPatch = Partial<Pick<DramaNamedAsset, EditableField>>;

function pickEditable(patch: OneClickAssetPatch): Partial<DramaNamedAsset> {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(patch)) {
        if (EDITABLE.has(key) && value !== undefined) next[key] = value;
    }
    return next as Partial<DramaNamedAsset>;
}

function assetsOf(project: DramaProject, kind: OneClickAssetKind): DramaNamedAsset[] {
    return (project[kind] as DramaNamedAsset[] | undefined) || [];
}

function withAssets(project: DramaProject, kind: OneClickAssetKind, assets: DramaNamedAsset[]): DramaProject {
    return { ...project, [kind]: assets } as DramaProject;
}

/**
 * 新增资产。
 *
 * L 的资产名称在项目内唯一（提取时靠名称去重），这里沿用同一约束：
 * 同名资产直接拒绝，而不是静默产生两个同名锚点导致参考图编号错位。
 */
export function createOneClickAsset(project: DramaProject, kind: OneClickAssetKind, input: OneClickAssetPatch): { project: DramaProject; asset: DramaNamedAsset } {
    const name = input.name?.trim() || "";
    if (!name) throw new OneClickAssetCrudError("资产名称不能为空");
    const assets = assetsOf(project, kind);
    if (assets.some((item) => item.name.trim() === name)) throw new OneClickAssetCrudError(`已存在同名资产：${name}`, 409);

    // name 已单独 trim 过，从白名单补丁里剔除，避免未规整的原始值把它覆盖回去。
    const editable = pickEditable(input);
    delete editable.name;
    const asset: DramaNamedAsset = {
        id: `asset-${crypto.randomUUID()}`,
        description: "",
        // 角色固定四视图；场景/道具取各自默认（单图）
        generationLayout: kind === "characters" ? "four_view" : defaultDramaAssetGenerationLayout(kind),
        references: [],
        ...editable,
        name,
    };
    return { project: withAssets(project, kind, [...assets, asset]), asset };
}

/** 更新资产可编辑字段；不触碰 references / primaryReferenceId。 */
export function updateOneClickAsset(project: DramaProject, kind: OneClickAssetKind, assetId: string, patch: OneClickAssetPatch): { project: DramaProject; asset: DramaNamedAsset } {
    const assets = assetsOf(project, kind);
    const existing = assets.find((item) => item.id === assetId);
    if (!existing) throw new OneClickAssetCrudError("资产不存在", 404);

    const name = patch.name === undefined ? existing.name : patch.name.trim();
    if (!name) throw new OneClickAssetCrudError("资产名称不能为空");
    if (name !== existing.name && assets.some((item) => item.id !== assetId && item.name.trim() === name)) {
        throw new OneClickAssetCrudError(`已存在同名资产：${name}`, 409);
    }

    const next: DramaNamedAsset = { ...existing, ...pickEditable(patch), name };
    return {
        project: withAssets(
            project,
            kind,
            assets.map((item) => (item.id === assetId ? next : item)),
        ),
        asset: next,
    };
}

/**
 * 删除资产。
 *
 * 规范禁止幽灵资产引用，所以必须同时清掉所有分镜里对该资产的绑定，
 * 否则分镜会指向一个不存在的 ID，生成时才报错。
 */
export function deleteOneClickAsset(project: DramaProject, kind: OneClickAssetKind, assetId: string): DramaProject {
    const assets = assetsOf(project, kind);
    if (!assets.some((item) => item.id === assetId)) throw new OneClickAssetCrudError("资产不存在", 404);

    const pruned = withAssets(
        project,
        kind,
        assets.filter((item) => item.id !== assetId),
    );

    return {
        ...pruned,
        episodes: pruned.episodes.map((episode) => ({
            ...episode,
            shots: episode.shots.map((shot) => ({
                ...shot,
                ...(kind === "characters" ? { characterIds: shot.characterIds.filter((id) => id !== assetId) } : {}),
                ...(kind === "props" ? { propIds: shot.propIds.filter((id) => id !== assetId) } : {}),
                ...(kind === "scenes" && shot.sceneId === assetId ? { sceneId: undefined } : {}),
            })),
        })),
    };
}
