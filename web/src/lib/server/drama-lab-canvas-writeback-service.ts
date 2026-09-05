import { nanoid } from "nanoid";

import { CanvasNodeType, isCanvasImageNodeType, type CanvasNodeData } from "@/app/(user)/canvas/types";
import type { DramaCanvasAssetType, DramaCanvasShotField, DramaCanvasWritebackApplied, DramaCanvasWritebackInput, DramaCanvasWritebackKind } from "@/lib/drama-lab-canvas-writeback-contract";
import { parseDramaLabEpisodeCanvasHandoffId } from "@/lib/drama-lab-canvas-contract";
import type { DramaAssetReference, DramaNamedAsset, DramaProject, DramaShot, DramaShotFrameType } from "@/lib/drama-project-contract";
import { isLocalMediaRegistrationExpired, getLocalMediaRegistration } from "@/lib/server/local-media-registry";
import { updateDramaProject, DramaProjectStoreError } from "@/lib/server/drama-project-store";
import { getDramaLabCanvasProjectWithOwnerForUser } from "@/lib/server/canvas-project-service";
import { resolveDramaLabProjectForRequest } from "@/lib/server/drama-lab-collaboration-service";

/** Actions a short-drama Canvas may explicitly apply to the source project. */
export type DramaCanvasWritebackRequest = DramaCanvasWritebackInput;

export type DramaCanvasWritebackResult = {
    project: DramaProject;
    canvas: { id: string; updatedAt: string };
    applied: {
        kind: DramaCanvasWritebackKind;
        nodeId: string;
        projectId: string;
        episodeId: string;
        shotId?: string;
        assetId?: string;
        assetType?: DramaCanvasAssetType;
        frameType?: DramaShotFrameType;
        field?: DramaCanvasShotField;
    };
};

const SHOT_FIELDS = new Set<DramaCanvasShotField>([
    "description",
    "sourceText",
    "shotBoundary",
    "dialogue",
    "narration",
    "imagePrompt",
    "videoPrompt",
    "cameraMotion",
    "shotType",
    "segmentTitle",
    "atmosphere",
    "lightingStyle",
    "depthOfField",
    "universalSegmentText",
    "polishedPrompt",
    "cameraAngle",
    "angleH",
    "angleV",
    "angleS",
    "location",
    "time",
    "action",
    "result",
    "emotion",
    "layoutDescription",
    "startFramePrompt",
    "endFramePrompt",
    "negativePrompt",
]);
const FRAME_TYPES = new Set<DramaShotFrameType>(["first", "key", "last"]);
const ASSET_TYPES = new Set<DramaCanvasAssetType>(["character", "scene", "prop"]);
const MAX_TEXT_LENGTH = 32_000;

export class DramaCanvasWritebackError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

/**
 * Applies one explicit Canvas result to the owned DramaProject. Canvas is a
 * staging area: this function never mutates CanvasProject and never infers a
 * target from a node title or display name.
 */
export async function writebackDramaCanvasForUser(userIdValue: string, canvasIdValue: string, value: unknown): Promise<DramaCanvasWritebackResult> {
    const userId = requiredText(userIdValue, "user");
    const canvasId = requiredText(canvasIdValue, "canvas");
    const input = normalizeRequest(value);
    const canvasResolved = await getDramaLabCanvasProjectWithOwnerForUser(userId, canvasId);
    const canvas = canvasResolved.project;
    const binding = parseDramaLabEpisodeCanvasHandoffId(canvas.sourceHandoffId);
    if (!binding || binding.projectId !== input.projectId || binding.episodeId !== input.episodeId) {
        throw new DramaCanvasWritebackError("Canvas is not bound to the requested drama project and episode", 409);
    }
    if (input.expectedCanvasUpdatedAt && canonicalTimestamp(input.expectedCanvasUpdatedAt) !== canonicalTimestamp(canvas.updatedAt)) {
        throw new DramaCanvasWritebackError("Canvas changed elsewhere; refresh before applying the result", 409);
    }

    const node = canvas.nodes.find((item) => item.id === input.nodeId);
    if (!node) throw new DramaCanvasWritebackError("Canvas node does not exist", 404);
    assertNodeBinding(node, input.projectId, input.episodeId);
    assertTargetBinding(node, input);

    const projectResolved = await resolveDramaLabProjectForRequest(userId, input.projectId);
    const current = projectResolved.project;
    if (!current) throw new DramaCanvasWritebackError("Drama project does not exist", 404);
    if (canonicalTimestamp(input.expectedProjectUpdatedAt) !== canonicalTimestamp(current.updatedAt)) {
        throw new DramaCanvasWritebackError("Drama project changed elsewhere; refresh before applying the result", 409);
    }
    const episode = current.episodes.find((item) => item.id === input.episodeId);
    if (!episode) throw new DramaCanvasWritebackError("Episode does not belong to this drama project", 404);
    const shot = input.shotId ? episode.shots.find((item) => item.id === input.shotId) : undefined;
    if (input.kind !== "asset-reference" && !shot) throw new DramaCanvasWritebackError("A real shot ID is required for this writeback action", 404);

    const media = await resolveNodeMedia(canvasResolved.ownerUserId, current.id, canvas.id, node, input.kind);
    const nextProject = applyWriteback(current, episode.id, shot, input, node, media);
    if (nextProject === current) throw new DramaCanvasWritebackError("Canvas result is identical to the current value", 409);

    let saved: DramaProject;
    try {
        saved = await updateDramaProject(projectResolved.ownerUserId, nextProject, current.updatedAt);
    } catch (error) {
        if (error instanceof DramaProjectStoreError) throw new DramaCanvasWritebackError(error.message, error.status);
        throw error;
    }
    return {
        project: saved,
        canvas: { id: canvas.id, updatedAt: canvas.updatedAt },
        applied: {
            kind: input.kind,
            nodeId: input.nodeId,
            projectId: input.projectId,
            episodeId: input.episodeId,
            ...(input.shotId ? { shotId: input.shotId } : {}),
            ...(input.assetId ? { assetId: input.assetId } : {}),
            ...(input.assetType ? { assetType: input.assetType } : {}),
            ...(input.frameType ? { frameType: input.frameType } : {}),
            ...(input.field ? { field: input.field } : {}),
        } satisfies DramaCanvasWritebackApplied,
    };
}

function normalizeRequest(
    value: unknown,
): Required<Pick<DramaCanvasWritebackRequest, "projectId" | "episodeId" | "nodeId" | "kind" | "expectedProjectUpdatedAt">> & Omit<DramaCanvasWritebackRequest, "projectId" | "episodeId" | "nodeId" | "kind" | "expectedProjectUpdatedAt"> {
    const input = object(value);
    const target = object(input.target);
    const kind = normalizeKind(input.kind ?? input.targetType ?? target.kind ?? target.type);
    if (!kind) throw new DramaCanvasWritebackError("Writeback action is invalid", 400);
    const projectId = requiredText(input.projectId ?? input.dramaProjectId, "project");
    const episodeId = requiredText(input.episodeId, "episode");
    const nodeId = requiredText(input.nodeId, "node");
    const expectedProjectUpdatedAt = canonicalTimestamp(input.expectedProjectUpdatedAt);
    if (!expectedProjectUpdatedAt) throw new DramaCanvasWritebackError("expectedProjectUpdatedAt is required", 400);
    const expectedCanvasUpdatedAt = input.expectedCanvasUpdatedAt === undefined ? undefined : canonicalTimestamp(input.expectedCanvasUpdatedAt);
    if (input.expectedCanvasUpdatedAt !== undefined && !expectedCanvasUpdatedAt) throw new DramaCanvasWritebackError("expectedCanvasUpdatedAt is invalid", 400);
    const shotId = optionalText(input.shotId);
    const assetId = optionalText(input.assetId ?? target.assetId);
    const assetType = normalizeAssetType(input.assetType ?? target.assetType);
    const frameType = normalizeFrameType(input.frameType ?? target.frameType);
    const field = normalizeField(input.field ?? target.field);
    if (kind === "asset-reference" && (!assetId || !assetType)) throw new DramaCanvasWritebackError("assetId and assetType are required for an asset reference", 400);
    if (kind === "shot-frame" && (!shotId || !frameType)) throw new DramaCanvasWritebackError("shotId and frameType are required for a shot frame", 400);
    if (kind === "shot-video" && !shotId) throw new DramaCanvasWritebackError("shotId is required for a shot video", 400);
    if (kind === "shot-field" && (!shotId || !field)) throw new DramaCanvasWritebackError("shotId and field are required for a shot field", 400);
    if (kind === "asset-reference" && (shotId || frameType || field)) throw new DramaCanvasWritebackError("Asset reference writeback cannot include shot targets", 400);
    if (kind === "shot-frame" && (assetId || assetType || field)) throw new DramaCanvasWritebackError("Shot frame writeback cannot include asset or text targets", 400);
    if (kind === "shot-video" && (assetId || assetType || frameType || field)) throw new DramaCanvasWritebackError("Shot video writeback cannot include another target", 400);
    if (kind === "shot-field" && (assetId || assetType || frameType)) throw new DramaCanvasWritebackError("Shot field writeback cannot include asset or frame targets", 400);
    return { projectId, episodeId, nodeId, kind, expectedProjectUpdatedAt, expectedCanvasUpdatedAt, shotId, assetId, assetType, frameType, field };
}

function applyWriteback(project: DramaProject, episodeId: string, shot: DramaShot | undefined, input: ReturnType<typeof normalizeRequest>, node: CanvasNodeData, media: ResolvedNodeMedia | undefined) {
    if (input.kind === "asset-reference") return applyAssetReference(project, input.assetType!, input.assetId!, node, media!);
    if (!shot) throw new DramaCanvasWritebackError("Shot does not exist", 404);
    const episodes = project.episodes.map((episode) => {
        if (episode.id !== episodeId) return episode;
        const shots = episode.shots.map((item) => (item.id === shot.id ? applyShotWriteback(item, input, node, media) : item));
        return { ...episode, shots };
    });
    return { ...project, episodes, updatedAt: new Date().toISOString() };
}

function applyAssetReference(project: DramaProject, assetType: DramaCanvasAssetType, assetId: string, node: CanvasNodeData, media: ResolvedNodeMedia) {
    const assets = assetCollection(project, assetType);
    const index = assets.findIndex((item) => item.id === assetId);
    if (index < 0) throw new DramaCanvasWritebackError("Asset does not belong to this drama project", 404);
    const asset = assets[index];
    const existing = asset.references?.find((reference) => (media.storageKey && reference.storageKey === media.storageKey) || reference.url === media.url);
    const reference: DramaAssetReference = existing || {
        id: `canvas-reference-${nanoid(12)}`,
        url: media.url,
        storageKey: media.storageKey,
        source: "generated",
        label: text(node.title, 200) || "Canvas reference",
        width: media.width,
        height: media.height,
        createdAt: new Date().toISOString(),
    };
    const references = existing ? [...(asset.references || [])] : [...(asset.references || []), reference].slice(-50);
    const nextAsset: DramaNamedAsset = { ...asset, references, primaryReferenceId: reference.id, referenceImageUrl: reference.url, referenceStorageKey: reference.storageKey };
    const nextAssets = assets.slice();
    nextAssets[index] = nextAsset;
    return { ...project, [assetTypeCollectionKey(assetType)]: nextAssets, updatedAt: new Date().toISOString() } as DramaProject;
}

function applyShotWriteback(shot: DramaShot, input: ReturnType<typeof normalizeRequest>, node: CanvasNodeData, media: ResolvedNodeMedia | undefined): DramaShot {
    if (input.kind === "shot-frame") {
        if (!media) throw new DramaCanvasWritebackError("A stable image is required for a frame", 422);
        const current = shot.frames?.[input.frameType!];
        if (current?.locked) throw new DramaCanvasWritebackError("This frame is locked; unlock it before applying another image", 409);
        const taskId = node.metadata?.imageTask?.id || node.metadata?.agentTaskId;
        const history =
            current?.url && current.url !== media.url
                ? [
                      ...(current.history || []),
                      {
                          id: `frame:${input.frameType}:${current.taskId || current.url}`,
                          taskId: current.taskId || `frame:${input.frameType}:${current.url}`,
                          url: current.url,
                          prompt: current.prompt || "",
                          createdAt: new Date().toISOString(),
                          width: current.width,
                          height: current.height,
                      },
                  ].slice(-20)
                : current?.history;
        return {
            ...shot,
            frames: {
                ...shot.frames,
                [input.frameType!]: {
                    ...(current || { prompt: "" }),
                    status: "success",
                    taskId,
                    attempt: undefined,
                    url: media.url,
                    storageKey: media.storageKey,
                    width: media.width,
                    height: media.height,
                    error: undefined,
                    history,
                    source: "generated",
                    sourceVideoTaskId: undefined,
                    sourceShotId: undefined,
                    sourceVideoHistoryId: undefined,
                    locked: false,
                },
            },
        };
    }
    if (input.kind === "shot-video") {
        if (!media) throw new DramaCanvasWritebackError("A stable video is required for a shot video", 422);
        const taskId = node.metadata?.videoTask?.id || node.metadata?.agentTaskId;
        const history =
            shot.videoUrl && shot.videoUrl !== media.url
                ? [
                      ...(shot.videoHistory || []),
                      { id: `video:${shot.generationTaskId || shot.videoUrl}`, taskId: shot.generationTaskId || `video:${shot.videoUrl}`, url: shot.videoUrl, prompt: shot.videoPrompt || "", createdAt: new Date().toISOString() },
                  ].slice(-20)
                : shot.videoHistory;
        return { ...shot, generationStatus: "success", generationTaskId: taskId, generationNeedsReview: undefined, generationError: undefined, videoUrl: media.url, videoHistory: history };
    }
    const content = text(node.metadata?.content || node.metadata?.composerContent || node.metadata?.prompt || node.metadata?.sourcePrompt, MAX_TEXT_LENGTH);
    if (!content) throw new DramaCanvasWritebackError("Canvas node has no text content", 422);
    return { ...shot, [input.field!]: content } as DramaShot;
}

type ResolvedNodeMedia = { url: string; storageKey?: string; width?: number; height?: number; type: "image" | "video" };

async function resolveNodeMedia(userId: string, projectId: string, canvasId: string, node: CanvasNodeData, kind: DramaCanvasWritebackKind): Promise<ResolvedNodeMedia | undefined> {
    if (kind === "shot-field") {
        if (node.type !== CanvasNodeType.Text) throw new DramaCanvasWritebackError("Canvas node must be a text node for a shot field", 422);
        return undefined;
    }
    const expectedType = kind === "shot-video" ? "video" : "image";
    const nodeIsExpected = expectedType === "image" ? isCanvasImageNodeType(node.type) : node.type === CanvasNodeType.Video;
    if (!nodeIsExpected) throw new DramaCanvasWritebackError(`Canvas node must contain a ${expectedType}`, 422);
    const url = stableUrl(node.metadata?.content) || stableUrl(node.metadata?.serverUrl) || stableUrl(node.metadata?.remoteUrl);
    if (!url) throw new DramaCanvasWritebackError("Canvas node does not contain a stable media URL", 422);
    const storageKey = stableStorageKey(node.metadata?.storageKey);
    // A remote URL without a registered storage key is not attributable to
    // the current Canvas/user. Accept only local relative URLs in that case;
    // otherwise an arbitrary external URL could be written into the Drama
    // project as if it were a generated asset. The check also covers
    // protocol-relative URLs and non-HTTP schemes, which browsers resolve as
    // external resources even though they do not start with `https://`.
    if (!storageKey && isExternalStableUrl(url)) {
        throw new DramaCanvasWritebackError("Canvas media must include an owned storage key", 403);
    }
    if (storageKey) {
        const registration = await getLocalMediaRegistration(storageKey);
        if (
            !registration ||
            registration.ownerUserId !== userId ||
            (registration.projectId && registration.projectId !== projectId && registration.projectId !== canvasId) ||
            registration.type !== expectedType ||
            isLocalMediaRegistrationExpired(registration)
        ) {
            throw new DramaCanvasWritebackError("Canvas media is not owned by the current user or is no longer available", 403);
        }
    }
    return { url, storageKey, width: positive(node.metadata?.naturalWidth), height: positive(node.metadata?.naturalHeight), type: expectedType };
}

function assertNodeBinding(node: CanvasNodeData, projectId: string, episodeId: string) {
    const metadata = (node.metadata || {}) as Record<string, unknown>;
    const nodeProjectId = text(metadata.dramaProjectId, 200);
    const nodeEpisodeId = text(metadata.episodeId, 200);
    if ((nodeProjectId && nodeProjectId !== projectId) || (nodeEpisodeId && nodeEpisodeId !== episodeId)) throw new DramaCanvasWritebackError("Canvas node belongs to another drama context", 409);
}

function assertTargetBinding(node: CanvasNodeData, input: ReturnType<typeof normalizeRequest>) {
    const metadata = (node.metadata || {}) as Record<string, unknown>;
    const nodeAssetId = optionalText(metadata.assetId);
    const nodeAssetType = normalizeAssetType(metadata.assetType);
    const nodeShotId = optionalText(metadata.shotId);
    if (nodeShotId && input.shotId && nodeShotId !== input.shotId) throw new DramaCanvasWritebackError("Canvas node belongs to another shot", 409);
    if (input.assetId && nodeAssetId && nodeAssetId !== input.assetId) throw new DramaCanvasWritebackError("Canvas node belongs to another asset", 409);
    if (input.assetType && nodeAssetType && nodeAssetType !== input.assetType) throw new DramaCanvasWritebackError("Canvas node belongs to another asset type", 409);
}

function assetCollection(project: DramaProject, type: DramaCanvasAssetType): DramaNamedAsset[] {
    return type === "character" ? project.characters : type === "scene" ? project.scenes : project.props;
}

function assetTypeCollectionKey(type: DramaCanvasAssetType) {
    return type === "character" ? "characters" : type === "scene" ? "scenes" : "props";
}

function normalizeKind(value: unknown): DramaCanvasWritebackKind | undefined {
    return value === "asset-reference" || value === "shot-frame" || value === "shot-video" || value === "shot-field" ? value : undefined;
}

function normalizeAssetType(value: unknown): DramaCanvasAssetType | undefined {
    return typeof value === "string" && ASSET_TYPES.has(value as DramaCanvasAssetType) ? (value as DramaCanvasAssetType) : undefined;
}

function normalizeFrameType(value: unknown): DramaShotFrameType | undefined {
    return typeof value === "string" && FRAME_TYPES.has(value as DramaShotFrameType) ? (value as DramaShotFrameType) : undefined;
}

function normalizeField(value: unknown): DramaCanvasShotField | undefined {
    return typeof value === "string" && SHOT_FIELDS.has(value as DramaCanvasShotField) ? (value as DramaCanvasShotField) : undefined;
}

function stableUrl(value: unknown) {
    const url = typeof value === "string" ? value.trim().slice(0, 4000) : "";
    return url && !/^(data|blob):/i.test(url) ? url : "";
}

function isExternalStableUrl(url: string) {
    // A scheme (`https:`, `ftp:`, `file:`, etc.) or an authority prefix
    // (`//host` and its backslash variants) is not a local relative path.
    // Backslashes are included because WHATWG URL parsing normalizes them for
    // special schemes and can otherwise turn a seemingly relative value into
    // an external host.
    return /^[a-z][a-z\d+.-]*:/i.test(url) || /^[\\/]{2}/.test(url);
}

function stableStorageKey(value: unknown) {
    const key = typeof value === "string" ? value.trim().replace(/\\/g, "/").replace(/^\/+/, "").slice(0, 700) : "";
    return key || undefined;
}

function requiredText(value: unknown, label: string) {
    const result = typeof value === "string" ? value.trim().slice(0, 200) : "";
    if (!result) throw new DramaCanvasWritebackError(`${label} is required`, 400);
    return result;
}

function optionalText(value: unknown) {
    const result = typeof value === "string" ? value.trim().slice(0, 200) : "";
    return result || undefined;
}

function text(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function canonicalTimestamp(value: unknown) {
    if (typeof value !== "string") return "";
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : "";
}

function positive(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? Math.round(number) : undefined;
}

function object(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
