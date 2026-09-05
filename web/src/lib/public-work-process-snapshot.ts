import type { PublishedWorkAssetRecord } from "@/lib/server/database";
import type { PublicCanvasConnection, PublicCanvasNode, PublicDramaCharacter, PublicDramaEpisode, PublicDramaScene, PublicDramaShot, PublicProcessAsset, PublicProcessSnapshot } from "./practice-domain";

export type PublicWorkProcessSnapshotInput = {
    sourceType: "canvas" | "drama";
    versionId: string;
    source: unknown;
    assets: readonly PublishedWorkAssetRecord[];
};

export class PublicProcessSnapshotError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "PublicProcessSnapshotError";
    }
}

export function buildPublicWorkProcessSnapshot(input: PublicWorkProcessSnapshotInput): PublicProcessSnapshot {
    if (input.sourceType !== "canvas" && input.sourceType !== "drama") throw new PublicProcessSnapshotError("只支持 Canvas 或短剧作品");
    const source = record(input.source);
    const versionId = clean(input.versionId, 160);
    if (!source || !versionId) throw new PublicProcessSnapshotError("公开制作流程来源无效");

    const assets = input.assets.map(publicAsset);
    const assetByStorageKey = new Map(input.assets.map((asset, index) => [normalizeStorageKey(asset.storageKey), assets[index]]));
    const sourceAssetIds = (value: unknown) => collectAssetIds(value, assetByStorageKey);

    if (input.sourceType === "canvas") {
        const nodes = records(source.nodes).map((node) => canvasNode(node, sourceAssetIds));
        const nodeIds = new Set(nodes.map((node) => node.id));
        const connections = records(source.connections)
            .map((connection) => canvasConnection(connection))
            .filter((connection): connection is PublicCanvasConnection => Boolean(connection && nodeIds.has(connection.fromNodeId) && nodeIds.has(connection.toNodeId)));
        return { sourceType: "canvas", versionId, title: optionalText(source.title, 120), nodes, connections, assets };
    }

    return {
        sourceType: "drama",
        versionId,
        title: optionalText(source.title, 120),
        summary: optionalText(source.summary, 500),
        style: optionalText(source.style, 120),
        ratio: optionalText(source.ratio, 40),
        characters: records(source.characters).map((character) => dramaCharacter(character, sourceAssetIds)),
        scenes: records(source.scenes).map(dramaScene),
        episodes: records(source.episodes).map((episode, index) => dramaEpisode(episode, index, sourceAssetIds)),
        assets,
    };
}

export function parsePublicWorkProcessSnapshot(value: unknown): PublicProcessSnapshot | null {
    const source = record(value);
    if (!source || (source.sourceType !== "canvas" && source.sourceType !== "drama") || !clean(source.versionId, 160)) return null;
    if (!Array.isArray(source.assets) || !source.assets.every(isPublicAsset)) return null;
    if (source.sourceType === "canvas") {
        if (!Array.isArray(source.nodes) || !Array.isArray(source.connections) || !source.nodes.every(isCanvasNode) || !source.connections.every(isCanvasConnection)) return null;
        return { sourceType: "canvas", versionId: clean(source.versionId, 160), title: optionalText(source.title, 120), nodes: source.nodes, connections: source.connections, assets: source.assets };
    }
    if (!Array.isArray(source.characters) || !Array.isArray(source.scenes) || !Array.isArray(source.episodes) || !source.characters.every(isDramaCharacter) || !source.scenes.every(isDramaScene) || !source.episodes.every(isDramaEpisode)) return null;
    return {
        sourceType: "drama",
        versionId: clean(source.versionId, 160),
        title: optionalText(source.title, 120),
        summary: optionalText(source.summary, 500),
        style: optionalText(source.style, 120),
        ratio: optionalText(source.ratio, 40),
        characters: source.characters,
        scenes: source.scenes,
        episodes: source.episodes,
        assets: source.assets,
    };
}

function canvasNode(node: Record<string, unknown>, assetIds: (value: unknown) => string[]) {
    return compact<PublicCanvasNode>({
        id: clean(node.id, 160) || "node-unknown",
        type: clean(node.type, 60) || "text",
        title: optionalText(node.title, 120),
        summary: optionalText(record(node.metadata)?.content || record(node.metadata)?.composerContent, 500),
        position: position(node.position),
        assetIds: assetIds(node),
    });
}

function canvasConnection(value: Record<string, unknown>): PublicCanvasConnection | null {
    const id = clean(value.id, 160);
    const fromNodeId = clean(value.fromNodeId, 160);
    const toNodeId = clean(value.toNodeId, 160);
    return id && fromNodeId && toNodeId ? { id, fromNodeId, toNodeId } : null;
}

function dramaCharacter(value: Record<string, unknown>, assetIds: (value: unknown) => string[]): PublicDramaCharacter {
    return compact<PublicDramaCharacter>({
        id: clean(value.id, 160),
        name: clean(value.name, 120) || "未命名角色",
        summary: optionalText(value.description, 500),
        assetIds: assetIds({ references: value.references, referenceStorageKey: value.referenceStorageKey }),
    });
}

function dramaScene(value: Record<string, unknown>): PublicDramaScene {
    return compact<PublicDramaScene>({ id: clean(value.id, 160), title: optionalText(value.name || value.title, 120), summary: optionalText(value.description, 500) });
}

function dramaEpisode(value: Record<string, unknown>, index: number, assetIds: (value: unknown) => string[]): PublicDramaEpisode {
    return compact<PublicDramaEpisode>({
        id: clean(value.id, 160) || `episode-${index + 1}`,
        title: clean(value.title, 120) || `第 ${index + 1} 集`,
        order: index + 1,
        scriptSummary: optionalText(value.script, 4_000),
        reviewStatus: optionalText(value.reviewStatus, 40),
        shots: records(value.shots).map((shot, shotIndex) => dramaShot(shot, shotIndex, assetIds)),
    });
}

function dramaShot(value: Record<string, unknown>, index: number, assetIds: (value: unknown) => string[]): PublicDramaShot {
    const all = assetIds(value);
    const storyboard = assetIds({ storyboardImageUrl: value.storyboardImageUrl, storyboardEndImageUrl: value.storyboardEndImageUrl });
    const video = assetIds({ videoUrl: value.videoUrl });
    const audio = assetIds({ audioUrl: value.audioUrl });
    return compact<PublicDramaShot>({
        id: clean(value.id, 160) || `shot-${index + 1}`,
        order: number(value.order, index + 1),
        title: optionalText(value.title, 120),
        summary: optionalText(value.description, 500),
        sceneId: optionalText(value.sceneId, 160),
        storyboardAssetIds: storyboard.length ? storyboard : all.filter((id) => !video.includes(id) && !audio.includes(id)),
        videoAssetIds: video,
        audioAssetIds: audio,
    });
}

function publicAsset(asset: PublishedWorkAssetRecord): PublicProcessAsset {
    const metadata = record(asset.metadata);
    return compact<PublicProcessAsset>({ id: asset.id, title: optionalText(metadata?.originalName, 160), type: asset.mediaType });
}

function collectAssetIds(value: unknown, assetByStorageKey: Map<string, PublicProcessAsset>) {
    const ids = new Set<string>();
    const visit = (current: unknown) => {
        if (typeof current === "string") {
            const normalized = normalizeStorageKey(current);
            const direct = assetByStorageKey.get(normalized);
            if (direct) ids.add(direct.id);
            for (const [storageKey, asset] of assetByStorageKey) if (storageKey && (normalized.includes(storageKey) || decodeURIComponentSafe(normalized).includes(storageKey))) ids.add(asset.id);
            return;
        }
        if (Array.isArray(current)) return current.forEach(visit);
        const object = record(current);
        if (object) Object.values(object).forEach(visit);
    };
    visit(value);
    return [...ids];
}

function isPublicAsset(value: unknown): value is PublicProcessAsset {
    const object = record(value);
    return Boolean(
        object &&
        clean(object.id, 160) &&
        (object.type === undefined || typeof object.type === "string") &&
        (object.title === undefined || typeof object.title === "string") &&
        (object.role === undefined || object.role === "cover" || object.role === "content"),
    );
}

function isCanvasNode(value: unknown): value is PublicCanvasNode {
    const object = record(value);
    return Boolean(object && clean(object.id, 160) && typeof object.type === "string" && (object.position === undefined || position(object.position)) && (object.assetIds === undefined || stringArray(object.assetIds)));
}

function isCanvasConnection(value: unknown): value is PublicCanvasConnection {
    const object = record(value);
    return Boolean(object && clean(object.id, 160) && clean(object.fromNodeId, 160) && clean(object.toNodeId, 160));
}

function isDramaCharacter(value: unknown): value is PublicDramaCharacter {
    const object = record(value);
    return Boolean(object && clean(object.id, 160) && typeof object.name === "string" && (object.assetIds === undefined || stringArray(object.assetIds)));
}

function isDramaScene(value: unknown): value is PublicDramaScene {
    const object = record(value);
    return Boolean(object && clean(object.id, 160) && (object.assetIds === undefined || stringArray(object.assetIds)));
}

function isDramaEpisode(value: unknown): value is PublicDramaEpisode {
    const object = record(value);
    return Boolean(object && clean(object.id, 160) && typeof object.title === "string" && Number.isInteger(object.order) && Array.isArray(object.shots) && object.shots.every(isDramaShot));
}

function isDramaShot(value: unknown): value is PublicDramaShot {
    const object = record(value);
    return Boolean(
        object &&
        clean(object.id, 160) &&
        Number.isInteger(object.order) &&
        (object.storyboardAssetIds === undefined || stringArray(object.storyboardAssetIds)) &&
        (object.videoAssetIds === undefined || stringArray(object.videoAssetIds)) &&
        (object.audioAssetIds === undefined || stringArray(object.audioAssetIds)),
    );
}

function stringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === "string" && Boolean(item));
}

function position(value: unknown): { x: number; y: number } | undefined {
    const object = record(value);
    const x = Number(object?.x);
    const y = Number(object?.y);
    return Number.isFinite(x) && Number.isFinite(y) ? { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 } : undefined;
}

function records(value: unknown) {
    return Array.isArray(value)
        ? value.flatMap((item) => {
              const object = record(item);
              return object ? [object] : [];
          })
        : [];
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function clean(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function optionalText(value: unknown, max: number) {
    const text = clean(value, max);
    return text || undefined;
}

function normalizeStorageKey(value: string) {
    return value.trim().replaceAll("\\", "/").replace(/^\/+/, "");
}

function decodeURIComponentSafe(value: string) {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function number(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : fallback;
}

function compact<T extends Record<string, unknown>>(value: T): T {
    return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && (!Array.isArray(item) || item.length > 0))) as T;
}
