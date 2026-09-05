import { CanvasNodeType, type CanvasConnection, type CanvasNodeData, type CanvasNodeMetadata } from "@/app/(user)/canvas/types";
import type { CanvasProject } from "@/lib/canvas-project-contract";
import { dramaLabEpisodeCanvasHandoffId } from "@/lib/drama-lab-canvas-contract";
import type { DramaEpisode, DramaNamedAsset, DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { createDramaLabCanvasProjectForUser, deleteDramaLabEpisodeCanvasForUser } from "@/lib/server/canvas-project-service";
import { getCanvasProject, updateCanvasProject } from "@/lib/server/canvas-project-store";
import { resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";
import { getDramaProject } from "@/lib/server/drama-project-store";

type DramaLabSourceEntityType = "episode" | "script" | "character" | "scene" | "prop" | "shot" | "image" | "video";
type DramaLabCanvasMetadata = CanvasNodeMetadata & {
    projectionOwned: true;
    dramaProjectId: string;
    episodeId: string;
    sourceEntityType: DramaLabSourceEntityType;
    sourceEntityId: string;
    assetType?: "character" | "scene" | "prop";
    assetId?: string;
    shotId?: string;
    sceneId?: string;
    characterIds?: string[];
    propIds?: string[];
    mediaRole?: "asset-reference" | "storyboard" | "storyboard-end" | "first-frame" | "key-frame" | "last-frame" | "video";
    referenceId?: string;
};

export class DramaLabEpisodeCanvasServiceError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

export function dramaLabEpisodeCanvasSourceHandoffId(projectId: string, episodeId: string) {
    return dramaLabEpisodeCanvasHandoffId(requiredId(projectId, "短剧项目"), requiredId(episodeId, "剧集"));
}

export async function getOrCreateDramaLabEpisodeCanvasForUser(userIdValue: string, projectIdValue: string, episodeIdValue: string, shotIdValue?: string) {
    const userId = requiredId(userIdValue, "用户");
    const projectId = requiredId(projectIdValue, "短剧项目");
    const episodeId = requiredId(episodeIdValue, "剧集");
    const resolved = await resolveDramaLabProjectForRequest(userId, projectId);
    const project = resolved.project;
    const ownerUserId = resolved.ownerUserId;
    if (!project) throw new DramaLabEpisodeCanvasServiceError("短剧项目不存在", 404);
    const episode = project.episodes.find((item) => item.id === episodeId);
    if (!episode) throw new DramaLabEpisodeCanvasServiceError("剧集不存在或不属于当前短剧项目", 404);
    const shotId = optionalId(shotIdValue);
    const shotIndex = shotId ? orderedShots(episode.shots).findIndex((item) => item.id === shotId) : -1;
    if (shotId && shotIndex < 0) throw new DramaLabEpisodeCanvasServiceError("分镜不存在或不属于当前剧集", 404);

    const sourceHandoffId = dramaLabEpisodeCanvasSourceHandoffId(project.id, episode.id);
    const projection = projectEpisodeToCanvas(project, episode);
    const title = `${project.title} · ${episode.title}`;
    const requestedViewport = shotIndex >= 0 ? shotViewport(shotIndex) : projection.viewport;
    const canvasProject = await createDramaLabCanvasProjectForUser(ownerUserId, {
        title,
        sourceHandoffId,
        ipReferences: project.ipReferences,
        project: {
            title,
            sourceHandoffId,
            nodes: projection.nodes,
            connections: projection.connections,
            viewport: requestedViewport,
        },
    });
    const latestProject = await getDramaProject(project.id, ownerUserId);
    if (!latestProject || !latestProject.episodes.some((item) => item.id === episode.id)) {
        await deleteDramaLabEpisodeCanvasForUser(ownerUserId, project.id, episode.id);
        throw new DramaLabEpisodeCanvasServiceError("剧集不存在或已被删除，请刷新后重试", 404);
    }
    const mergeInput = { prefix: `dl:${project.id}:episode:${episode.id}`, title, requestedViewport, locateShot: shotIndex >= 0 };
    const syncedProject = mergeEpisodeProjection(canvasProject, projection, mergeInput);
    const savedProject = await persistEpisodeProjectionWithRetry(ownerUserId, canvasProject, syncedProject, projection, mergeInput);
    return {
        project: savedProject,
        binding: { dramaProjectId: project.id, episodeId: episode.id, sourceHandoffId, ...(shotId ? { shotId } : {}) },
    };
}

async function persistEpisodeProjectionWithRetry(userId: string, current: CanvasProject, merged: CanvasProject, projection: ReturnType<typeof projectEpisodeToCanvas>, input: Parameters<typeof mergeEpisodeProjection>[2]) {
    if (merged === current) return current;
    try {
        return await updateCanvasProject(userId, merged, current.updatedAt);
    } catch (error) {
        if (!isCanvasVersionConflict(error)) throw error;
        const latest = await getCanvasProject(current.id, userId);
        if (!latest) throw error;
        const retried = mergeEpisodeProjection(latest, projection, input);
        return retried === latest ? latest : updateCanvasProject(userId, retried, latest.updatedAt);
    }
}

function isCanvasVersionConflict(error: unknown): error is { status: 409 } {
    return Boolean(error && typeof error === "object" && "status" in error && (error as { status?: unknown }).status === 409);
}

export const resolveDramaLabEpisodeCanvas = getOrCreateDramaLabEpisodeCanvasForUser;

export function projectEpisodeToCanvas(project: DramaProject, episode: DramaEpisode) {
    const prefix = `dl:${project.id}:episode:${episode.id}`;
    const nodes: CanvasNodeData[] = [];
    const connections: CanvasConnection[] = [];
    const characterIds = new Set(project.characters.map((item) => item.id));
    const sceneIds = new Set(project.scenes.map((item) => item.id));
    const propIds = new Set(project.props.map((item) => item.id));

    nodes.push(
        textNode(`${prefix}:episode`, episode.title, { x: 0, y: -440 }, episodeSummary(project, episode), sourceMetadata(project.id, episode.id, "episode", episode.id)),
        textNode(`${prefix}:script`, `${episode.title} · 剧本`, { x: 0, y: -80 }, episode.script, sourceMetadata(project.id, episode.id, "script", episode.id)),
    );
    connections.push(connection(`${prefix}:edge:episode:script`, `${prefix}:episode`, `${prefix}:script`));

    project.characters.forEach((asset, index) => nodes.push(assetNode(prefix, project.id, episode.id, "character", asset, { x: -1_200, y: index * 300 })));
    project.scenes.forEach((asset, index) => nodes.push(assetNode(prefix, project.id, episode.id, "scene", asset, { x: -800, y: index * 300 })));
    project.props.forEach((asset, index) => nodes.push(assetNode(prefix, project.id, episode.id, "prop", asset, { x: -400, y: index * 300 })));

    orderedShots(episode.shots).forEach((shot, index) => {
        const shotNodeId = `${prefix}:shot:${shot.id}`;
        const validCharacterIds = uniqueIds(shot.characterIds).filter((id) => characterIds.has(id));
        const validPropIds = uniqueIds(shot.propIds).filter((id) => propIds.has(id));
        const validSceneId = shot.sceneId && sceneIds.has(shot.sceneId) ? shot.sceneId : undefined;
        nodes.push(
            textNode(shotNodeId, shot.title, { x: 520, y: index * 620 }, shotText(shot), {
                ...sourceMetadata(project.id, episode.id, "shot", shot.id),
                shotId: shot.id,
                sceneId: validSceneId,
                characterIds: validCharacterIds,
                propIds: validPropIds,
            }),
        );
        connections.push(connection(`${prefix}:edge:script:${shot.id}`, `${prefix}:script`, shotNodeId));
        validCharacterIds.forEach((id) => connections.push(connection(`${prefix}:edge:character:${id}:${shot.id}`, `${prefix}:character:${id}`, shotNodeId)));
        validPropIds.forEach((id) => connections.push(connection(`${prefix}:edge:prop:${id}:${shot.id}`, `${prefix}:prop:${id}`, shotNodeId)));
        if (validSceneId) connections.push(connection(`${prefix}:edge:scene:${validSceneId}:${shot.id}`, `${prefix}:scene:${validSceneId}`, shotNodeId));

        const mediaNodes = shotMediaNodes(prefix, project.id, episode.id, shot, index);
        nodes.push(...mediaNodes);
        mediaNodes.forEach((node) => connections.push(connection(`${prefix}:edge:shot:${shot.id}:${node.id.slice(`${prefix}:shot:${shot.id}:`.length)}`, shotNodeId, node.id)));
    });

    return { nodes, connections, viewport: { x: 120, y: 120, k: 0.72 } };
}

export function mergeEpisodeProjection(current: CanvasProject, projection: ReturnType<typeof projectEpisodeToCanvas>, input: { prefix: string; title: string; requestedViewport: CanvasProject["viewport"]; locateShot: boolean }): CanvasProject {
    const currentById = new Map(current.nodes.map((node) => [node.id, node]));
    const projectedNodes = projection.nodes.map((node) => {
        const existing = currentById.get(node.id);
        return existing ? { ...node, position: existing.position, width: existing.width, height: existing.height } : node;
    });
    const currentProjectionNodeIds = new Set(current.nodes.filter((node) => isProjectionNode(node, input.prefix)).map((node) => node.id));
    const freeNodes = current.nodes.filter((node) => !currentProjectionNodeIds.has(node.id));
    const nodes = [...projectedNodes, ...freeNodes];
    const nodeIds = new Set(nodes.map((node) => node.id));
    const projectedEdges = new Set(projection.connections.map((edge) => edge.id));
    const freeConnections = current.connections.filter((edge) => !isProjectionConnection(edge, input.prefix, currentProjectionNodeIds) && !projectedEdges.has(edge.id) && nodeIds.has(edge.fromNodeId) && nodeIds.has(edge.toNodeId));
    const connections = [...projection.connections, ...freeConnections];
    const viewport = input.locateShot ? input.requestedViewport : current.viewport;
    const changed = current.title !== input.title || !sameJson(current.nodes, nodes) || !sameJson(current.connections, connections) || !sameJson(current.viewport, viewport);
    if (!changed) return current;
    return {
        ...current,
        title: input.title,
        nodes,
        connections,
        viewport,
        updatedAt: nextProjectVersion(current.updatedAt),
    };
}

function assetNode(prefix: string, projectId: string, episodeId: string, assetType: "character" | "scene" | "prop", asset: DramaNamedAsset, position: { x: number; y: number }): CanvasNodeData {
    const reference = asset.references?.find((item) => item.id === asset.primaryReferenceId) || asset.references?.[0];
    const referenceUrl = stableMediaUrl(reference?.url) || stableMediaUrl(asset.referenceImageUrl);
    const metadata: DramaLabCanvasMetadata = {
        ...sourceMetadata(projectId, episodeId, assetType, asset.id),
        assetType,
        assetId: asset.id,
        sourcePrompt: assetText(asset),
        ...(referenceUrl
            ? {
                  content: referenceUrl,
                  status: "success" as const,
                  storageKey: reference?.storageKey || asset.referenceStorageKey,
                  naturalWidth: reference?.width,
                  naturalHeight: reference?.height,
                  mediaRole: "asset-reference" as const,
                  referenceId: reference?.id,
              }
            : { content: assetText(asset) }),
    };
    return {
        id: `${prefix}:${assetType}:${asset.id}`,
        type: referenceUrl ? CanvasNodeType.Image : CanvasNodeType.Text,
        title: `${assetLabel(assetType)} · ${asset.name}`,
        position,
        width: 340,
        height: referenceUrl ? 260 : 220,
        metadata,
    };
}

function shotMediaNodes(prefix: string, projectId: string, episodeId: string, shot: DramaShot, shotIndex: number) {
    const nodes: CanvasNodeData[] = [];
    const base = { x: 960, y: shotIndex * 620 };
    const images: Array<{ suffix: string; title: string; url?: string; width?: number; height?: number; role: DramaLabCanvasMetadata["mediaRole"] }> = [
        { suffix: "image", title: `${shot.title} · 分镜图`, url: shot.storyboardImageUrl, width: shot.storyboardImageWidth, height: shot.storyboardImageHeight, role: "storyboard" },
        { suffix: "image:end", title: `${shot.title} · 结束帧`, url: shot.storyboardEndImageUrl, width: shot.storyboardEndImageWidth, height: shot.storyboardEndImageHeight, role: "storyboard-end" },
        { suffix: "frame:first", title: `${shot.title} · 首帧`, url: shot.frames?.first?.url, width: shot.frames?.first?.width, height: shot.frames?.first?.height, role: "first-frame" },
        { suffix: "frame:key", title: `${shot.title} · 关键帧`, url: shot.frames?.key?.url, width: shot.frames?.key?.width, height: shot.frames?.key?.height, role: "key-frame" },
        { suffix: "frame:last", title: `${shot.title} · 尾帧`, url: shot.frames?.last?.url, width: shot.frames?.last?.width, height: shot.frames?.last?.height, role: "last-frame" },
    ];
    images.forEach((image) => {
        const url = stableMediaUrl(image.url);
        if (!url) return;
        nodes.push(
            mediaNode(`${prefix}:shot:${shot.id}:${image.suffix}`, CanvasNodeType.Image, image.title, { x: base.x, y: base.y + nodes.length * 280 }, url, image.width, image.height, {
                ...sourceMetadata(projectId, episodeId, "image", shot.id),
                shotId: shot.id,
                mediaRole: image.role,
            }),
        );
    });
    const videoUrl = stableMediaUrl(shot.videoUrl);
    if (videoUrl) {
        nodes.push(
            mediaNode(`${prefix}:shot:${shot.id}:video`, CanvasNodeType.Video, `${shot.title} · 视频`, { x: 1_360, y: base.y }, videoUrl, undefined, undefined, {
                ...sourceMetadata(projectId, episodeId, "video", shot.id),
                shotId: shot.id,
                mediaRole: "video",
            }),
        );
    }
    return nodes;
}

function textNode(id: string, title: string, position: { x: number; y: number }, content: string, metadata: DramaLabCanvasMetadata): CanvasNodeData {
    return { id, type: CanvasNodeType.Text, title, position, width: 380, height: 280, metadata: { ...metadata, content } };
}

function mediaNode(id: string, type: CanvasNodeType.Image | CanvasNodeType.Video, title: string, position: { x: number; y: number }, url: string, width: number | undefined, height: number | undefined, metadata: DramaLabCanvasMetadata): CanvasNodeData {
    return {
        id,
        type,
        title,
        position,
        width: 340,
        height: 240,
        metadata: { ...metadata, content: url, status: "success", naturalWidth: width, naturalHeight: height },
    };
}

function sourceMetadata(projectId: string, episodeId: string, sourceEntityType: DramaLabSourceEntityType, sourceEntityId: string): DramaLabCanvasMetadata {
    return { projectionOwned: true, dramaProjectId: projectId, episodeId, sourceEntityType, sourceEntityId };
}

function connection(id: string, fromNodeId: string, toNodeId: string): CanvasConnection {
    return { id, fromNodeId, toNodeId };
}

function orderedShots(shots: DramaShot[]) {
    return [...shots].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
}

function uniqueIds(values: string[] | undefined) {
    return Array.from(new Set((values || []).map((value) => value.trim()).filter(Boolean)));
}

function episodeSummary(project: DramaProject, episode: DramaEpisode) {
    return [`项目：${project.title}`, `剧集：${episode.title}`, `风格：${project.style}`, `画幅：${project.ratio}`, episode.outline && `梗概：${episode.outline}`].filter(Boolean).join("\n");
}

function shotText(shot: DramaShot) {
    return [
        shot.description,
        shot.sourceText,
        shot.dialogue && `对白：${shot.dialogue}`,
        shot.narration && `旁白：${shot.narration}`,
        shot.imagePrompt && `画面提示词：${shot.imagePrompt}`,
        shot.videoPrompt && `视频提示词：${shot.videoPrompt}`,
        shot.cameraMotion && `运镜：${shot.cameraMotion}`,
    ]
        .filter(Boolean)
        .join("\n");
}

function assetText(asset: DramaNamedAsset) {
    return [asset.description, asset.profile?.visualIdentity, asset.profile?.styling, asset.profile?.colorPalette, asset.profile?.consistencyRules].filter(Boolean).join("\n");
}

function assetLabel(type: "character" | "scene" | "prop") {
    return type === "character" ? "角色" : type === "scene" ? "场景" : "道具";
}

function stableMediaUrl(value: unknown) {
    if (typeof value !== "string") return undefined;
    const url = value.trim();
    return url && !/^(data|blob):/i.test(url) ? url : undefined;
}

function requiredId(value: unknown, label: string) {
    const id = typeof value === "string" ? value.trim() : "";
    if (!id) throw new DramaLabEpisodeCanvasServiceError(`${label} ID 不能为空`, 400);
    if (id.length > 160) throw new DramaLabEpisodeCanvasServiceError(`${label} ID 过长`, 400);
    return id;
}

function optionalId(value: unknown) {
    const id = typeof value === "string" ? value.trim() : "";
    if (id.length > 160) throw new DramaLabEpisodeCanvasServiceError("分镜 ID 过长", 400);
    return id;
}

function shotViewport(index: number): CanvasProject["viewport"] {
    return { x: -520, y: 250 - index * 620, k: 0.72 };
}

function isProjectionNode(node: CanvasNodeData, prefix: string) {
    const metadata = node.metadata as Partial<DramaLabCanvasMetadata> | undefined;
    if (!(node.id === `${prefix}:episode` || node.id === `${prefix}:script` || node.id.startsWith(`${prefix}:character:`) || node.id.startsWith(`${prefix}:scene:`) || node.id.startsWith(`${prefix}:prop:`) || node.id.startsWith(`${prefix}:shot:`)))
        return false;
    return Boolean(metadata?.projectionOwned === true || (metadata?.dramaProjectId && metadata.episodeId && metadata.sourceEntityType && metadata.sourceEntityId));
}

function isProjectionConnection(connection: CanvasConnection, prefix: string, projectionNodeIds: Set<string>) {
    return connection.id.startsWith(`${prefix}:edge:`) && projectionNodeIds.has(connection.fromNodeId) && projectionNodeIds.has(connection.toNodeId);
}

function sameJson(left: unknown, right: unknown) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function nextProjectVersion(current: string) {
    const previous = Date.parse(current);
    return new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString();
}
