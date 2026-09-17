import { dramaAssetPrimaryReference } from "@/lib/drama-asset-references";
import type { DramaAssetReference, DramaAssetVisualDetails } from "@/lib/drama-project-contract";
import { readDramaLabAssetVisualDetails } from "@/lib/drama-lab-asset-image-prompt";

import type { OneClickAsset } from "./asset-crud";
import type { OneClickAssetKind } from "./asset-image-service";

export class OneClickAssetLibraryError extends Error {
    constructor(
        message: string,
        readonly status = 400,
    ) {
        super(message);
        this.name = "OneClickAssetLibraryError";
    }
}

/** L 素材库的 dramaAssetType 用单数，与项目集合键不同名。 */
const LIBRARY_ASSET_TYPE: Record<OneClickAssetKind, "character" | "scene" | "prop"> = { characters: "character", scenes: "scene", props: "prop" };
const KIND_LABEL: Record<OneClickAssetKind, string> = { characters: "角色", scenes: "场景", props: "道具" };

/**
 * 组装"存入素材库"的载荷，对应 L 的
 * `POST /{characters,scenes,props}/:id/add-to-library` 与 `add-to-material-library`。
 *
 * L 有"角色库/场景库/道具库"和"素材库"两套；V 只有统一素材库，靠 `metadata.dramaAssetType`
 * 区分类别。所以 L 那两个端点在 V 侧收敛为同一个动作 —— 这是结构差异，不是丢语义。
 *
 * 视觉字段（appearance / imagePrompt / polishedPrompt / stages 等）通过
 * `readDramaLabAssetVisualDetails` 一并带入 metadata，取用时才能还原成可直接生图的资产。
 */
export function buildOneClickLibraryPayload(asset: OneClickAsset, kind: OneClickAssetKind) {
    const primary = dramaAssetPrimaryReference(asset);
    if (!primary) throw new OneClickAssetLibraryError("请先为该资产生成或上传参考图，再存入素材库");
    const name = asset.name?.trim();
    if (!name) throw new OneClickAssetLibraryError("资产名称不能为空");

    return {
        kind: "image" as const,
        title: name,
        coverUrl: primary.url,
        tags: ["一键成片", KIND_LABEL[kind]],
        source: "一键成片",
        note: asset.description || "",
        metadata: {
            ...readDramaLabAssetVisualDetails(asset),
            source: "one-click-film",
            dramaAssetType: LIBRARY_ASSET_TYPE[kind],
            ...(kind === "characters" && asset.voiceProfile ? { voiceProfile: asset.voiceProfile } : {}),
        },
        data: {
            dataUrl: primary.url,
            storageKey: primary.storageKey,
            serverUrl: primary.url.startsWith("/") ? primary.url : undefined,
            remoteUrl: /^https?:\/\//i.test(primary.url) ? primary.url : undefined,
            width: primary.width || 1,
            height: primary.height || 1,
            bytes: 0,
            mimeType: "image/png",
        },
    };
}

type LibraryRecord = {
    id: string;
    kind: string;
    title: string;
    coverUrl?: string;
    note?: string;
    metadata?: Record<string, unknown>;
    data?: Record<string, unknown>;
};

function libraryImageUrl(record: LibraryRecord) {
    const data = record.data || {};
    for (const key of ["serverUrl", "remoteUrl", "dataUrl"]) {
        const value = data[key];
        if (typeof value === "string" && value.trim() && !value.startsWith("blob:")) return value.trim();
    }
    return record.coverUrl?.trim() || "";
}

function positive(value: unknown) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : undefined;
}

/**
 * 把素材库条目取用为资产参考图，对应 L `PUT /{characters,scenes}/:id/image-from-library`。
 *
 * L 的语义是"用库里这张图替换当前主图"，同时把库条目的视觉字段回填到资产上，
 * 这样取用后可以直接生图而不必重新写提示词。这里保持一致：
 * 新参考图置顶为 primary，旧主图降级为 history。
 */
export type OneClickLibraryApplyPatch = DramaAssetVisualDetails & {
    references: DramaAssetReference[];
    primaryReferenceId: string;
    referenceImageUrl: string;
    referenceStorageKey?: string;
};

export function buildOneClickLibraryApply(asset: OneClickAsset, record: LibraryRecord): OneClickLibraryApplyPatch {
    if (record.kind !== "image") throw new OneClickAssetLibraryError("只能取用图片类素材");
    const url = libraryImageUrl(record);
    if (!url) throw new OneClickAssetLibraryError("该素材没有可用的图片地址");

    const reference: DramaAssetReference = {
        id: `reference-${crypto.randomUUID()}`,
        url,
        source: "library",
        role: "primary",
        label: record.title?.trim() || "素材库图片",
        createdAt: new Date().toISOString(),
        ...(typeof record.data?.storageKey === "string" && record.data.storageKey.trim() ? { storageKey: record.data.storageKey.trim() } : {}),
        ...(positive(record.data?.width) === undefined ? {} : { width: positive(record.data?.width) }),
        ...(positive(record.data?.height) === undefined ? {} : { height: positive(record.data?.height) }),
    };

    const previous = dramaAssetPrimaryReference(asset);
    const rest = (asset.references || []).filter((item) => item.id !== previous?.id);
    const references: DramaAssetReference[] = [reference, ...(previous ? [{ ...previous, role: "history" as const }] : []), ...rest];

    // 回填库条目的视觉字段，但不覆盖资产已有的非空值 —— 用户手工填过的内容优先。
    const details = readDramaLabAssetVisualDetails(record.metadata);
    const carried: DramaAssetVisualDetails = {};
    for (const [key, value] of Object.entries(details)) {
        if (value === undefined || value === null || value === "") continue;
        // 用户已填过的字段优先，不被库条目覆盖。
        if ((asset as Record<string, unknown>)[key]) continue;
        (carried as Record<string, unknown>)[key] = value;
    }

    return {
        ...carried,
        references,
        primaryReferenceId: reference.id,
        referenceImageUrl: reference.url,
        referenceStorageKey: reference.storageKey,
    };
}
