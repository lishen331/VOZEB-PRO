import { mkdtemp, readFile, readFile as readFileBytes, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";

import { nanoid } from "nanoid";
import { unzipSync, zipSync, type Zippable } from "fflate";

import type { DramaAssetReference, DramaNamedAsset, DramaProject, DramaShot, DramaTaskStatus } from "@/lib/drama-project-contract";
import { createDramaProjectForUser, deleteDramaProjectForUser, getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { ensureDramaLabProjectGroup } from "@/lib/server/drama-lab-collaboration-service";
import { deleteLocalMediaAssetsByStorageKeys, GENERATION_MEDIA_ROOT, REFERENCE_MEDIA_ROOT } from "@/lib/server/local-media-storage";
import { getLocalMediaRegistration, type LocalMediaRegistration } from "@/lib/server/local-media-registry";
import { writeReferenceMediaFile } from "@/lib/server/reference-asset-store";
import { downloadMediaToFile } from "@/lib/server/media-download";

export const DRAMA_LAB_ARCHIVE_FORMAT = "vozeb-drama-lab-project";
export const DRAMA_LAB_ARCHIVE_VERSION = 1;
export const DRAMA_LAB_ARCHIVE_FILE = "project.json";

const MAX_ARCHIVE_BYTES = 320 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 420 * 1024 * 1024;
const MAX_MEDIA_BYTES = 200 * 1024 * 1024;
const MAX_PROJECT_JSON_BYTES = 8 * 1024 * 1024;

export class DramaLabProjectArchiveError extends Error {
    constructor(
        message: string,
        readonly status = 422,
    ) {
        super(message);
    }
}

type ArchiveMediaManifest = {
    id: string;
    zipPath?: string;
    scope: "generation" | "reference";
    type: "image" | "video" | "audio";
    mimeType: string;
    bytes: number;
    originalName?: string;
    included: boolean;
};

type DramaLabProjectArchive = {
    format: typeof DRAMA_LAB_ARCHIVE_FORMAT;
    version: typeof DRAMA_LAB_ARCHIVE_VERSION;
    exportedAt: string;
    projectId: string;
    project: unknown;
    media: ArchiveMediaManifest[];
    taskRefs: Array<{ taskId: string; field: string; status?: string }>;
    warnings?: string[];
};

/** Parsed archives retain ZIP entries only in memory for media restoration. */
type ParsedDramaLabProjectArchive = DramaLabProjectArchive & {
    __entries: Record<string, Uint8Array>;
};

type ExportInput = {
    userId: string;
    projectId: string;
    /** Project aggregate owner when the caller is an approved collaborator. */
    projectOwnerUserId?: string;
    origin?: string;
    cookie?: string;
    includeMedia?: boolean;
};

export async function exportDramaLabProjectForUser(input: ExportInput) {
    const project = await getDramaProjectForUser(input.projectOwnerUserId || input.userId, input.projectId);
    const includeMedia = input.includeMedia !== false;
    // Collaborators resolve the owner's project aggregate; its registrations
    // are owned by that same stable storage owner.
    const media = await collectProjectMedia(project, input.projectOwnerUserId || input.userId, {
        origin: input.origin || "http://localhost",
        cookie: input.cookie,
        includeMedia,
    });
    const portableProject = replaceProjectMedia(project, media.bySourceKey);
    const archive: DramaLabProjectArchive = {
        format: DRAMA_LAB_ARCHIVE_FORMAT,
        version: DRAMA_LAB_ARCHIVE_VERSION,
        exportedAt: new Date().toISOString(),
        projectId: project.id,
        project: portableProject,
        media: media.manifest,
        taskRefs: collectTaskRefs(project),
        ...(media.warnings.length ? { warnings: media.warnings } : {}),
    };
    const projectJson = Buffer.from(JSON.stringify(archive, null, 2), "utf8");
    if (projectJson.byteLength > MAX_PROJECT_JSON_BYTES) throw new DramaLabProjectArchiveError("项目归档 JSON 超过大小限制", 413);

    const entries: Zippable = { [DRAMA_LAB_ARCHIVE_FILE]: projectJson };
    for (const item of media.files) entries[item.zipPath] = item.bytes;
    const data = zipSync(entries, { level: 0 });
    if (data.byteLength > MAX_ARCHIVE_BYTES) throw new DramaLabProjectArchiveError("项目归档超过 320MB 大小限制", 413);
    return {
        data,
        fileName: `${safeFileName(project.title) || "短剧项目"}-短剧实验室.zip`,
        projectId: project.id,
        mediaCount: media.files.length,
        omittedMediaCount: media.warnings.length,
    };
}

export async function importDramaLabProjectForUser(input: { userId: string; archive: Uint8Array; origin?: string; cookie?: string }) {
    if (input.archive.byteLength > MAX_ARCHIVE_BYTES) throw new DramaLabProjectArchiveError("项目归档超过 320MB 大小限制", 413);
    const parsed = parseArchive(input.archive);
    const sourceProject = assertArchiveProject(parsed.project);
    validateProjectReferences(sourceProject);
    validateProjectMediaReferences(sourceProject, parsed.media);

    const remapped = remapProject(sourceProject);
    const base = await createDramaProjectForUser(
        input.userId,
        {
            title: remapped.title,
            summary: remapped.summary,
            style: remapped.style,
            ratio: remapped.ratio,
            defaultVideoMode: remapped.defaultVideoMode,
            initialScript: remapped.episodes[0]?.script || "",
        },
        {
            executionProfile: sourceProject.executionProfile,
            practiceSource: sourceProject.practiceSource,
        },
    );
    const writtenKeys: string[] = [];
    try {
        const restoredMedia = await restoreArchiveMedia({
            archive: parsed,
            userId: input.userId,
            projectId: base.id,
            origin: input.origin || "http://localhost",
            cookie: input.cookie,
        });
        writtenKeys.push(...restoredMedia.keys);
        const restoredProject = replaceImportedMedia(remapped, restoredMedia.byId);
        const project: DramaProject = {
            ...restoredProject,
            id: base.id,
            creativeConversationId: base.creativeConversationId,
            sourceHandoffId: undefined,
            createdAt: base.createdAt,
            updatedAt: new Date().toISOString(),
        };
        const saved = await updateDramaProjectForUser(input.userId, base.id, project);
        // Imported projects must enter the same collaboration boundary as
        // newly-created projects.  The importer is the initial manager and
        // can subsequently issue join invites or configure approvals.
        await ensureDramaLabProjectGroup(saved.id, input.userId);
        return {
            project: saved,
            mediaCount: restoredMedia.keys.length,
            warnings: [...(parsed.warnings || []), ...restoredMedia.warnings],
        };
    } catch (error) {
        for (const key of writtenKeys) {
            // The project has not been exposed to the caller yet.  Best-effort
            // cleanup keeps a failed import from leaking permanent media.
            await removeImportedMedia(key, input.userId).catch(() => undefined);
        }
        await deleteDramaProjectForUser(input.userId, base.id).catch(() => undefined);
        if (error instanceof DramaLabProjectArchiveError) throw error;
        throw new DramaLabProjectArchiveError(error instanceof Error ? error.message : "项目导入失败", 422);
    }
}

function parseArchive(bytes: Uint8Array): ParsedDramaLabProjectArchive {
    let entries: Record<string, Uint8Array>;
    try {
        entries = unzipSync(bytes);
    } catch {
        throw new DramaLabProjectArchiveError("项目归档不是有效 ZIP 文件");
    }
    const names = Object.keys(entries);
    for (const name of names) {
        if (!safeArchivePath(name) || name.replace(/\\/g, "/").replace(/^\/+/, "") !== name) throw new DramaLabProjectArchiveError("项目归档包含不安全的文件路径");
    }
    const projectBytes = entries[DRAMA_LAB_ARCHIVE_FILE];
    if (!projectBytes) throw new DramaLabProjectArchiveError("项目归档缺少 project.json");
    if (projectBytes.byteLength > MAX_PROJECT_JSON_BYTES) throw new DramaLabProjectArchiveError("project.json 超过大小限制", 413);
    const totalBytes = names.reduce((total, name) => total + entries[name].byteLength, 0);
    if (totalBytes > MAX_UNCOMPRESSED_BYTES) throw new DramaLabProjectArchiveError("项目归档解压后超过大小限制", 413);
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(projectBytes));
    } catch {
        throw new DramaLabProjectArchiveError("project.json 格式错误");
    }
    if (!value || typeof value !== "object") throw new DramaLabProjectArchiveError("project.json 根对象无效");
    const archive = value as Partial<DramaLabProjectArchive>;
    if (archive.format !== DRAMA_LAB_ARCHIVE_FORMAT || archive.version !== DRAMA_LAB_ARCHIVE_VERSION) throw new DramaLabProjectArchiveError("不支持的短剧项目归档版本");
    if (!archive.project || !Array.isArray(archive.media) || !Array.isArray(archive.taskRefs)) throw new DramaLabProjectArchiveError("项目归档缺少必要字段");
    const media = archive.media.map((item) => validateManifestItem(item, entries));
    const mediaIds = new Set<string>();
    const mediaPaths = new Set<string>();
    for (const item of media) {
        if (mediaIds.has(item.id)) throw new DramaLabProjectArchiveError("项目归档包含重复媒体 ID");
        mediaIds.add(item.id);
        if (item.zipPath) {
            if (mediaPaths.has(item.zipPath)) throw new DramaLabProjectArchiveError("项目归档包含重复媒体路径");
            mediaPaths.add(item.zipPath);
        }
    }
    return {
        format: DRAMA_LAB_ARCHIVE_FORMAT,
        version: DRAMA_LAB_ARCHIVE_VERSION,
        exportedAt: typeof archive.exportedAt === "string" ? archive.exportedAt : "",
        projectId: typeof archive.projectId === "string" ? archive.projectId : "",
        project: archive.project,
        media,
        taskRefs: archive.taskRefs.filter((item): item is { taskId: string; field: string; status?: string } => Boolean(item && typeof item === "object" && typeof item.taskId === "string" && typeof item.field === "string")),
        warnings: Array.isArray(archive.warnings) ? archive.warnings.filter((item): item is string => typeof item === "string").slice(0, 100) : [],
        __entries: entries,
    };
}

function validateManifestItem(value: unknown, entries: Record<string, Uint8Array>): ArchiveMediaManifest {
    if (!value || typeof value !== "object") throw new DramaLabProjectArchiveError("项目归档媒体清单无效");
    const item = value as Partial<ArchiveMediaManifest>;
    const id = cleanId(item.id);
    const type = item.type === "image" || item.type === "video" || item.type === "audio" ? item.type : undefined;
    const scope = item.scope === "generation" || item.scope === "reference" ? item.scope : undefined;
    const mimeType = typeof item.mimeType === "string" && /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(item.mimeType) ? item.mimeType : "";
    const bytes = Number(item.bytes);
    const included = item.included === true;
    if (!id || !type || !scope || !mimeType || !Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_MEDIA_BYTES) throw new DramaLabProjectArchiveError("项目归档媒体清单包含无效记录");
    const zipPath = item.zipPath === undefined ? undefined : safeArchivePath(item.zipPath);
    if (item.zipPath !== undefined && !zipPath) throw new DramaLabProjectArchiveError("项目归档媒体路径无效");
    if (included && (!zipPath || !entries[zipPath] || entries[zipPath].byteLength !== bytes)) throw new DramaLabProjectArchiveError("项目归档媒体文件缺失或大小不匹配");
    return { id, type, scope, mimeType, bytes, included, ...(zipPath ? { zipPath } : {}), ...(typeof item.originalName === "string" ? { originalName: item.originalName.slice(0, 255) } : {}) };
}

function assertArchiveProject(value: unknown): DramaProject {
    if (!value || typeof value !== "object") throw new DramaLabProjectArchiveError("项目数据无效");
    const project = value as Partial<DramaProject>;
    if (!cleanId(project.id) || typeof project.title !== "string" || !Array.isArray(project.episodes)) throw new DramaLabProjectArchiveError("项目数据缺少标题或剧集");
    if (JSON.stringify(project).length > MAX_PROJECT_JSON_BYTES) throw new DramaLabProjectArchiveError("项目数据超过大小限制", 413);
    return project as DramaProject;
}

function validateProjectReferences(project: DramaProject) {
    const characterIds = uniqueIds(project.characters);
    const sceneIds = uniqueIds(project.scenes);
    const propIds = uniqueIds(project.props);
    const clueIds = uniqueIds(project.clues);
    const episodeIds = uniqueIds(project.episodes);
    const shotIds = new Set<string>();
    if (characterIds.size !== project.characters.length || sceneIds.size !== project.scenes.length || propIds.size !== project.props.length || clueIds.size !== project.clues.length || episodeIds.size !== project.episodes.length)
        throw new DramaLabProjectArchiveError("项目归档包含重复资源 ID");
    for (const episode of project.episodes) {
        for (const shot of episode.shots || []) {
            const shotId = cleanId(shot.id);
            if (!shotId) throw new DramaLabProjectArchiveError("分镜缺少有效 ID");
            if (shotIds.has(shotId)) throw new DramaLabProjectArchiveError("项目归档包含重复分镜 ID");
            shotIds.add(shotId);
            if (shot.sceneId && !sceneIds.has(shot.sceneId)) throw new DramaLabProjectArchiveError("分镜引用了不存在的场景 ID");
            if ((shot.characterIds || []).some((id) => !characterIds.has(id))) throw new DramaLabProjectArchiveError("分镜引用了不存在的角色 ID");
            if ((shot.propIds || []).some((id) => !propIds.has(id))) throw new DramaLabProjectArchiveError("分镜引用了不存在的道具 ID");
            if ((shot.clueIds || []).some((id) => !clueIds.has(id))) throw new DramaLabProjectArchiveError("分镜引用了不存在的线索 ID");
        }
    }
}

function validateProjectMediaReferences(project: DramaProject, manifest: ArchiveMediaManifest[]) {
    const includedIds = new Set(manifest.filter((item) => item.included && item.zipPath).map((item) => item.id));
    const seen = new Set<string>();
    const visit = (value: unknown) => {
        if (typeof value === "string") {
            const match = value.match(/^media(?:-key)?:\/\/(.+)$/);
            if (match) seen.add(match[1]);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (value && typeof value === "object") Object.values(value).forEach(visit);
    };
    visit(project);
    for (const id of seen) {
        if (!includedIds.has(id)) throw new DramaLabProjectArchiveError(`媒体引用了无效的归档媒体 ID: ${id}`);
    }
}

function remapProject(source: DramaProject): DramaProject {
    const characterMap = makeIdMap(source.characters);
    const sceneMap = makeIdMap(source.scenes);
    const propMap = makeIdMap(source.props);
    const clueMap = makeIdMap(source.clues);
    const episodeMap = makeIdMap(source.episodes);
    const shotMap = new Map<string, string>();
    for (const episode of source.episodes) for (const shot of episode.shots || []) shotMap.set(shot.id, newEntityId("shot"));

    const remapAsset = <T extends DramaNamedAsset>(item: T, map: Map<string, string>): T => {
        const referenceMap = new Map<string, string>();
        const references: DramaAssetReference[] | undefined = Array.isArray(item.references)
            ? item.references.map((reference) => {
                  const id = newEntityId("reference");
                  if (typeof reference?.id === "string") referenceMap.set(reference.id, id);
                  return { ...reference, id };
              })
            : item.references;
        return {
            ...item,
            id: map.get(item.id) || newEntityId("asset"),
            references,
            primaryReferenceId: typeof item.primaryReferenceId === "string" ? referenceMap.get(item.primaryReferenceId) : undefined,
            referenceImageUrl: item.referenceImageUrl,
            referenceStorageKey: item.referenceStorageKey,
        } as T;
    };
    const characters = source.characters.map((item) => remapAsset(item, characterMap));
    const scenes = source.scenes.map((item) => remapAsset(item, sceneMap));
    const props = source.props.map((item) => remapAsset(item, propMap));
    const clues = source.clues.map((item) => ({ ...remapAsset(item, clueMap), payoff: item.payoff }));
    const sourceAssetMap = makeIdMap(source.sourceAssets || []);
    const sourceAssets = (source.sourceAssets || []).map((item) => ({ ...item, id: sourceAssetMap.get(item.id) || newEntityId("source") }));

    const episodes = source.episodes.map((episode, episodeIndex) => ({
        ...episode,
        id: episodeMap.get(episode.id) || newEntityId("episode"),
        episodeNumber: episode.episodeNumber || episodeIndex + 1,
        renderTask: undefined,
        shots: (episode.shots || []).map((shot) => remapShot(shot, shotMap, characterMap, sceneMap, propMap, clueMap)),
    }));
    const activeEpisodeId = source.activeEpisodeId ? episodeMap.get(source.activeEpisodeId) : undefined;
    return stripImportedTaskReferences({
        ...source,
        id: newEntityId("drama"),
        sourceHandoffId: undefined,
        creativeConversationId: undefined,
        activeEpisodeId: activeEpisodeId || episodes[0]?.id,
        characters,
        scenes,
        props,
        clues,
        sourceAssets,
        episodes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    });
}

function stripImportedTaskReferences<T>(value: T): T {
    if (Array.isArray(value)) return value.map((item) => stripImportedTaskReferences(item)) as T;
    if (!value || typeof value !== "object") return value;
    const output = Object.fromEntries(
        Object.entries(value as Record<string, unknown>)
            .filter(([key]) => !/taskid$/i.test(key) && key !== "sourceVideoTaskId")
            .map(([key, item]) => [key, stripImportedTaskReferences(item)]),
    );
    return output as T;
}

function remapShot(shot: DramaShot, shotMap: Map<string, string>, characterMap: Map<string, string>, sceneMap: Map<string, string>, propMap: Map<string, string>, clueMap: Map<string, string>): DramaShot {
    const mapped = {
        ...shot,
        id: shotMap.get(shot.id) || newEntityId("shot"),
        characterIds: (shot.characterIds || []).map((id) => characterMap.get(id)).filter((id): id is string => Boolean(id)),
        propIds: (shot.propIds || []).map((id) => propMap.get(id)).filter((id): id is string => Boolean(id)),
        clueIds: (shot.clueIds || []).map((id) => clueMap.get(id)).filter((id): id is string => Boolean(id)),
        sceneId: shot.sceneId ? sceneMap.get(shot.sceneId) : undefined,
        audioSplitSourceShotId: shot.audioSplitSourceShotId ? shotMap.get(shot.audioSplitSourceShotId) : undefined,
        generationStatus: resetTaskStatus(shot.generationStatus),
        storyboardStatus: resetTaskStatus(shot.storyboardStatus),
        storyboardEndStatus: resetTaskStatus(shot.storyboardEndStatus),
        audioStatus: resetTaskStatus(shot.audioStatus),
        generationTaskId: resetTaskId(shot.generationStatus, shot.generationTaskId),
        storyboardTaskId: resetTaskId(shot.storyboardStatus, shot.storyboardTaskId),
        storyboardEndTaskId: resetTaskId(shot.storyboardEndStatus, shot.storyboardEndTaskId),
        audioTaskId: resetTaskId(shot.audioStatus, shot.audioTaskId),
        utterances: Array.isArray(shot.utterances) ? shot.utterances.map((item) => ({ ...item, id: newEntityId("utterance") })) : [],
        frames: remapFrameStates(shot.frames),
        firstFrameCandidate: shot.firstFrameCandidate ? { ...shot.firstFrameCandidate, id: newEntityId("candidate"), sourceShotId: shotMap.get(shot.firstFrameCandidate.sourceShotId) || shot.firstFrameCandidate.sourceShotId } : undefined,
        videoFrameSnapshot: shot.videoFrameSnapshot
            ? { ...shot.videoFrameSnapshot, references: shot.videoFrameSnapshot.references.map((item) => ({ ...item, sourceShotId: item.sourceShotId ? shotMap.get(item.sourceShotId) || item.sourceShotId : undefined })) }
            : undefined,
        storyboardHistory: shot.storyboardHistory?.map((item) => ({ ...item, id: newEntityId("history") })),
        videoHistory: shot.videoHistory?.map((item) => ({ ...item, id: newEntityId("history") })),
    };
    return mapped;
}

function remapFrameStates(frames: DramaShot["frames"]) {
    if (!frames) return undefined;
    return Object.fromEntries(
        Object.entries(frames).map(([type, frame]) => [
            type,
            frame ? { ...frame, status: resetTaskStatus(frame.status), taskId: resetTaskId(frame.status, frame.taskId), history: frame.history?.map((item) => ({ ...item, id: newEntityId("history") })) } : frame,
        ]),
    ) as DramaShot["frames"];
}

function resetTaskStatus(status: DramaTaskStatus | undefined): DramaTaskStatus | undefined {
    return status === "queued" || status === "pending" || status === "running" ? "idle" : status;
}

function resetTaskId(status: string | undefined, taskId: string | undefined) {
    return status === "queued" || status === "pending" || status === "running" ? undefined : taskId;
}

function makeIdMap(items: Array<{ id: string }>) {
    return new Map(items.map((item) => [item.id, newEntityId("asset")]));
}

function newEntityId(prefix: string) {
    return `${prefix}-${nanoid(12)}`;
}

async function collectProjectMedia(project: DramaProject, userId: string, input: { origin: string; cookie?: string; includeMedia: boolean }) {
    const candidates = new Map<string, { sourceKey: string; field: string }>();
    collectMediaCandidates(project, "project", candidates);
    const registrations = new Map<string, LocalMediaRegistration>();
    const warnings: string[] = [];
    for (const candidate of candidates.values()) {
        const key = candidate.sourceKey;
        const registration = await getLocalMediaRegistration(key).catch(() => null);
        if (!registration || registration.ownerUserId !== userId || (registration.projectId && registration.projectId !== project.id)) {
            warnings.push(`媒体未导出：${candidate.field}`);
            continue;
        }
        registrations.set(key, registration);
    }
    const manifest: ArchiveMediaManifest[] = [];
    const files: Array<{ zipPath: string; bytes: Uint8Array }> = [];
    const bySourceKey = new Map<string, { id: string; manifest: ArchiveMediaManifest }>();
    const tempRoot = await mkdtemp(join(tmpdir(), "vozeb-drama-export-"));
    try {
        let index = 0;
        for (const [sourceKey, registration] of registrations) {
            // Project archives currently carry playable media only. Attachments
            // belong to the platform/IP-library flows and cannot be restored as
            // drama image, video, or audio references.
            if (registration.type === "attachment") {
                warnings.push(`媒体类型不支持归档：${sourceKey}`);
                continue;
            }
            index += 1;
            const id = `media-${index}-${nanoid(8)}`;
            const zipPath = `media/${id}${extensionFromMime(registration.mimeType, registration.type)}`;
            let mediaBytes: Uint8Array | undefined;
            if (input.includeMedia) {
                const target = join(tempRoot, `${id}.bin`);
                await downloadRegistration(registration, target, input.origin, input.cookie);
                mediaBytes = new Uint8Array(await readFileBytes(target));
                if (mediaBytes.byteLength > MAX_MEDIA_BYTES) throw new DramaLabProjectArchiveError("单个媒体文件超过 200MB", 413);
                files.push({ zipPath, bytes: mediaBytes });
            }
            const item: ArchiveMediaManifest = {
                id,
                zipPath: input.includeMedia ? zipPath : undefined,
                scope: registration.scope,
                type: registration.type,
                mimeType: registration.mimeType,
                bytes: input.includeMedia ? mediaBytes?.byteLength || registration.bytes : registration.bytes,
                included: input.includeMedia,
                ...(registration.originalName ? { originalName: registration.originalName } : {}),
            };
            manifest.push(item);
            bySourceKey.set(sourceKey, { id, manifest: item });
        }
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
    return { manifest, files, bySourceKey, warnings };
}

function collectMediaCandidates(value: unknown, path: string, output: Map<string, { sourceKey: string; field: string }>) {
    if (typeof value === "string") {
        const key = mediaStorageKeyFromValue(value, path);
        if (key) output.set(key, { sourceKey: key, field: path });
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((item, index) => collectMediaCandidates(item, `${path}[${index}]`, output));
        return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, item] of Object.entries(value)) collectMediaCandidates(item, `${path}.${key}`, output);
}

function mediaStorageKeyFromValue(value: string, field: string) {
    const trimmed = value.trim();
    if (!trimmed || /^(?:data|blob):/i.test(trimmed)) return undefined;
    try {
        const parsed = new URL(trimmed, "http://local");
        const pathName = decodeURIComponent(parsed.pathname);
        for (const prefix of ["/api/reference-assets/", "/api/generation-log-assets/"]) {
            if (pathName.startsWith(prefix)) return pathName.slice(prefix.length);
        }
    } catch {
        // Treat malformed external URLs as ordinary text.
    }
    if (/storagekey$/i.test(field.split(".").at(-1) || "") && /^(?:temporary|permanent)\//.test(trimmed)) return trimmed.replace(/^\/+/, "");
    return undefined;
}

function replaceProjectMedia(project: DramaProject, bySourceKey: Map<string, { id: string; manifest: ArchiveMediaManifest }>) {
    return transformPortableValue(project, "project", (value, field) => {
        const key = mediaStorageKeyFromValue(value, field);
        const item = key ? bySourceKey.get(key) : undefined;
        if (key && !item) return undefined;
        if (!item) return /^(?:data|blob):/i.test(value) ? undefined : value;
        return /storagekey$/i.test(field.split(".").at(-1) || "") ? `media-key://${item.id}` : `media://${item.id}`;
    });
}

function replaceImportedMedia(project: DramaProject, byId: Map<string, { storageKey: string; url: string }>) {
    return transformPortableValue(project, "project", (value, field) => {
        const keyMatch = value.match(/^media-key:\/\/(.+)$/);
        const urlMatch = value.match(/^media:\/\/(.+)$/);
        if (!keyMatch && !urlMatch) return value;
        const item = byId.get(keyMatch?.[1] || urlMatch?.[1] || "");
        if (!item) return undefined;
        return keyMatch ? item.storageKey : item.url;
    }) as DramaProject;
}

function transformPortableValue(value: unknown, path: string, transform: (value: string, field: string) => unknown): unknown {
    if (typeof value === "string") return transform(value, path);
    if (Array.isArray(value)) return value.map((item, index) => transformPortableValue(item, `${path}[${index}]`, transform)).filter((item) => item !== undefined);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(
        Object.entries(value)
            .map(([key, item]) => [key, transformPortableValue(item, `${path}.${key}`, transform)])
            .filter(([, item]) => item !== undefined),
    );
}

async function restoreArchiveMedia(input: { archive: ParsedDramaLabProjectArchive; userId: string; projectId: string; origin: string; cookie?: string }) {
    const byId = new Map<string, { storageKey: string; url: string }>();
    const keys: string[] = [];
    const warnings: string[] = [];
    const tempRoot = await mkdtemp(join(tmpdir(), "vozeb-drama-import-"));
    try {
        for (const item of input.archive.media) {
            if (!item.included || !item.zipPath) {
                warnings.push(`媒体未包含在归档中：${item.id}`);
                continue;
            }
            const source = getArchiveEntry(input.archive, item.zipPath);
            if (source.byteLength !== item.bytes) throw new DramaLabProjectArchiveError(`媒体 ${item.id} 大小校验失败`);
            const tempPath = join(tempRoot, basename(item.zipPath));
            await writeFile(tempPath, source);
            const stored = await writeReferenceMediaFile(tempPath, item.type, item.mimeType, true, {
                ownerUserId: input.userId,
                projectId: input.projectId,
                source: "drama-lab-project-import",
                originalName: item.originalName,
                maxBytes: MAX_MEDIA_BYTES,
            });
            const storageKey = stored.token;
            const url = stored.url || `/api/reference-assets/${stored.token}`;
            byId.set(item.id, { storageKey, url });
            keys.push(storageKey);
        }
    } finally {
        await rm(tempRoot, { recursive: true, force: true });
    }
    return { byId, keys, warnings };
}

function getArchiveEntry(archive: ParsedDramaLabProjectArchive, path: string) {
    const value = archive.__entries[path];
    if (!value) throw new DramaLabProjectArchiveError("项目归档媒体文件不存在");
    return value;
}

async function downloadRegistration(registration: LocalMediaRegistration, target: string, origin: string, cookie?: string) {
    const root = registration.scope === "generation" ? GENERATION_MEDIA_ROOT : REFERENCE_MEDIA_ROOT;
    if (registration.storageProvider !== "object") {
        const path = safeMediaPath(root, registration.storageKey);
        if (path) {
            const info = await stat(path).catch(() => null);
            if (info?.isFile()) {
                const bytes = await readFile(path);
                await writeFile(target, bytes);
                return;
            }
        }
    }
    const prefix = registration.scope === "generation" ? "/api/generation-log-assets/" : "/api/reference-assets/";
    await downloadMediaToFile(`${prefix}${registration.storageKey.split("/").map(encodeURIComponent).join("/")}`, target, { origin, cookie, maxBytes: MAX_MEDIA_BYTES });
}

async function removeImportedMedia(storageKey: string, userId: string) {
    const registration = await getLocalMediaRegistration(storageKey);
    if (!registration || registration.ownerUserId !== userId) return;
    await deleteLocalMediaAssetsByStorageKeys([storageKey], registration.scope).catch(async () => {
        const root = registration.scope === "generation" ? GENERATION_MEDIA_ROOT : REFERENCE_MEDIA_ROOT;
        const path = safeMediaPath(root, storageKey);
        if (path) await rm(path, { force: true });
    });
}

function safeMediaPath(root: string, key: string) {
    const normalizedRoot = resolve(root);
    const path = resolve(normalizedRoot, key.replace(/\\/g, "/"));
    return path !== normalizedRoot && path.startsWith(`${normalizedRoot}${sep}`) ? path : null;
}

function safeArchivePath(value: unknown) {
    if (typeof value !== "string") return undefined;
    const path = value.replace(/\\/g, "/").replace(/^\/+/, "");
    if (!path || path.includes("\0") || path.split("/").some((part) => part === "." || part === "..")) return undefined;
    return path;
}

function extensionFromMime(mimeType: string, type: ArchiveMediaManifest["type"]) {
    const mime = mimeType.toLowerCase();
    if (mime === "image/jpeg") return ".jpg";
    if (mime === "image/webp") return ".webp";
    if (mime === "image/gif") return ".gif";
    if (mime === "video/webm") return ".webm";
    if (mime === "video/quicktime") return ".mov";
    if (mime.startsWith("video/")) return ".mp4";
    if (mime === "audio/wav" || mime === "audio/x-wav") return ".wav";
    if (mime === "audio/ogg" || mime === "audio/opus") return ".ogg";
    if (mime === "audio/aac") return ".aac";
    if (mime.startsWith("audio/")) return ".mp3";
    return type === "image" ? ".png" : type === "video" ? ".mp4" : ".mp3";
}

function collectTaskRefs(project: DramaProject) {
    const refs: Array<{ taskId: string; field: string; status?: string }> = [];
    const visit = (value: unknown, path: string) => {
        if (!value || typeof value !== "object") return;
        if (Array.isArray(value)) {
            value.forEach((item, index) => visit(item, `${path}[${index}]`));
            return;
        }
        for (const [key, item] of Object.entries(value)) {
            if (/taskid$/i.test(key) && typeof item === "string" && item.trim()) {
                const parent = value as Record<string, unknown>;
                refs.push({ taskId: item, field: `${path}.${key}`, status: typeof parent[key.replace(/TaskId$/i, "Status")] === "string" ? String(parent[key.replace(/TaskId$/i, "Status")]) : undefined });
            }
            visit(item, `${path}.${key}`);
        }
    };
    visit(project, "project");
    return refs.slice(0, 10_000);
}

function uniqueIds(items: Array<{ id: string }>) {
    return new Set(items.map((item) => cleanId(item.id)).filter(Boolean));
}

function cleanId(value: unknown) {
    return typeof value === "string" && value.trim().length <= 200 ? value.trim() : "";
}

function safeFileName(value: string) {
    return value
        .trim()
        .replace(/[\\/:*?"<>|]/g, "_")
        .replace(/\.{2,}/g, "_")
        .replace(/[. ]+$/g, "")
        .slice(0, 100);
}
