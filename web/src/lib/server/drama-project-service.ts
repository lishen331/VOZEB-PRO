import { nanoid } from "nanoid";

import type {
    CreateDramaProjectInput,
    DramaAssetProfile,
    DramaAssetReference,
    DramaEpisode,
    DramaNamedAsset,
    DramaProject,
    DramaShot,
    DramaShotContinuity,
    DramaUtterance,
    DramaVideoMode,
    DramaShotFrameCandidate,
    DramaShotFrameSource,
    DramaShotFrameType,
    DramaShotVideoFrameSnapshot,
} from "@/lib/drama-project-contract";
import { parseDramaLabEpisodeCanvasHandoffId } from "@/lib/drama-lab-canvas-contract";
import { dramaRichContentToPlainText, normalizeDramaScriptRichContent } from "@/lib/drama-script-rich-content";
import { normalizeDramaImageSize } from "@/lib/drama-image-size";
import { resolveDramaShotDuration } from "@/lib/server/drama-shot-config";
import { listAgentRuns } from "@/lib/server/agent-run-store";
import { CreativeEntityDeletionConflict, deleteDramaConversationAggregate, deleteDramaProjectCanvasAggregates } from "@/lib/server/creative-entity-deletion-store";
import { createCreativeConversation, getCreativeConversation, listCreativeConversations, updateCreativeConversation } from "@/lib/server/creative-runtime-store";
import { createDramaProject, DramaProjectStoreError, findDramaProjectBySourceHandoffId, getDramaProject, listDramaProjectSummaries, updateDramaProject } from "@/lib/server/drama-project-store";
import { createDramaProjectVersion, getDramaProjectVersion, listDramaProjectVersions } from "@/lib/server/drama-project-version-store";
import { deleteUserMediaAssetsCascade } from "@/lib/server/user-media-deletion-service";
import type { DramaProjectIdentityInput } from "@/lib/server/drama-project-store";
import type { IpReference } from "@/lib/ip-library-domain";
import { normalizeIpReferences, recordIpReferenceUsage, validateIpReferences } from "@/lib/server/ip-library-reference-service";
import { deleteDramaLabEpisodeCanvasForUser, listDramaLabCanvasProjectsForUser } from "@/lib/server/canvas-project-service";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";

const MAX_PROJECT_BYTES = 2 * 1024 * 1024;

export class DramaProjectServiceError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
    }
}

export function listDramaProjectSummariesForUser(userId: string, input: { page?: number; pageSize?: number; executionProfile?: "production" | "open-source-practice" } = {}) {
    return listDramaProjectSummaries(userId, { ...input, executionProfile: input.executionProfile || "production" });
}

export async function getDramaProjectForUser(userId: string, id: string) {
    const project = await getDramaProject(cleanText(id), userId);
    if (!project) throw new DramaProjectServiceError("短剧项目不存在", 404);
    if ((project as DramaProject & { executionProfile?: string }).executionProfile === "open-source-practice") {
        try {
            await requirePracticeAccess({ id: userId });
        } catch (error) {
            const status = error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 403;
            throw new DramaProjectServiceError(error instanceof Error ? error.message : "短剧练习权限已失效", status);
        }
    }
    return project;
}

export async function createDramaProjectForUser(userId: string, value: unknown, identity: DramaProjectIdentityInput = {}) {
    const input = normalizeCreateInput(value);
    const now = new Date().toISOString();
    if (input.sourceHandoffId) {
        const existing = await findDramaProjectBySourceHandoffId(userId, input.sourceHandoffId);
        if (existing) return existing;
    }
    const ipReferences = (await validateIpReferences(userId, input.ipReferences)).map((item) => item.reference);
    const projectId = input.sourceHandoffId ? `drama-${input.sourceHandoffId}` : `drama-${nanoid()}`;
    const episode: DramaEpisode = {
        id: `episode-${nanoid()}`,
        episodeNumber: 1,
        title: "第 1 集",
        script: input.initialScript,
        outline: "",
        hook: "",
        nextPreview: "",
        sourceRange: "",
        reviewStatus: "draft",
        shots: [],
    };
    const conversation = await createCreativeConversation(userId, { surface: "drama", projectId, title: input.title });
    const project: DramaProject = {
        id: projectId,
        sourceHandoffId: input.sourceHandoffId,
        title: input.title,
        summary: input.summary,
        style: input.style,
        storyStyle: input.storyStyle,
        scriptType: input.scriptType,
        ratio: input.ratio,
        status: "active",
        creativeConversationId: conversation.id,
        activeEpisodeId: episode.id,
        characters: [],
        scenes: [],
        props: [],
        clues: [],
        defaultVideoMode: input.defaultVideoMode,
        episodes: [episode],
        sourceAssets: input.sourceAssets,
        ipReferences,
        createdAt: now,
        updatedAt: now,
    };
    try {
        if (ipReferences.length) await recordIpReferenceUsage(userId, { targetType: identity.executionProfile === "open-source-practice" ? "practice" : "drama", targetId: project.id, references: ipReferences });
        return await createDramaProject(userId, project, identity);
    } catch (error) {
        await updateCreativeConversation(conversation.id, userId, { status: "archived" }).catch(() => null);
        throw error;
    }
}

export async function updateDramaProjectForUser(userId: string, id: string, value: unknown) {
    const current = await getDramaProjectForUser(userId, id);
    const size = Buffer.byteLength(JSON.stringify(value || {}));
    if (size > MAX_PROJECT_BYTES) throw new DramaProjectServiceError("短剧项目数据过大", 413);
    const incomingUpdatedAt = parseTimestamp(object(value).updatedAt);
    if (incomingUpdatedAt && incomingUpdatedAt < parseTimestamp(current.updatedAt)) {
        await cleanupOrphanDramaEpisodeCanvases(userId, current.id, current.episodes);
        return current;
    }
    const source = object(value);
    const ipReferences = source.ipReferences === undefined ? current.ipReferences || [] : await validateIpReferenceUpdate(userId, current.ipReferences, source.ipReferences);
    const project = normalizeProject({ ...source, ipReferences }, current);
    if (incomingUpdatedAt) project.updatedAt = new Date(incomingUpdatedAt).toISOString();
    try {
        const added = addedIpReferences(current.ipReferences, ipReferences);
        if (added.length) await recordIpReferenceUsage(userId, { targetType: dramaUsageTarget(current), targetId: current.id, references: added });
        const saved = await updateDramaProject(userId, project, current.updatedAt);
        await cleanupOrphanDramaEpisodeCanvases(userId, saved.id, saved.episodes, current.episodes);
        return saved;
    } catch (error) {
        if (error instanceof DramaProjectStoreError) throw new DramaProjectServiceError(error.message, error.status);
        throw error;
    }
}

export async function listDramaProjectVersionsForUser(userId: string, id: string) {
    await getDramaProjectForUser(userId, cleanText(id));
    return listDramaProjectVersions(userId, cleanText(id));
}

export async function createDramaProjectVersionForUser(userId: string, id: string, value: unknown) {
    const current = await getDramaProjectForUser(userId, cleanText(id));
    const input = object(value);
    const snapshot = normalizeProject(input.snapshot, current);
    snapshot.ipReferences = (await validateIpReferences(userId, snapshot.ipReferences)).map((item) => item.reference);
    if (Buffer.byteLength(JSON.stringify(snapshot)) > MAX_PROJECT_BYTES) throw new DramaProjectServiceError("短剧版本数据过大", 413);
    const reason = cleanText(input.reason) || "手动保存版本";
    const added = addedIpReferences(current.ipReferences, snapshot.ipReferences);
    if (added.length) await recordIpReferenceUsage(userId, { targetType: dramaUsageTarget(current), targetId: current.id, references: added });
    return createDramaProjectVersion(userId, current.id, reason, snapshot);
}

export async function restoreDramaProjectVersionForUser(userId: string, id: string, versionId: string) {
    const projectId = cleanText(id);
    const current = await getDramaProjectForUser(userId, projectId);
    const version = await getDramaProjectVersion(userId, projectId, cleanText(versionId));
    if (!version) throw new DramaProjectServiceError("短剧版本不存在", 404);
    const restored = normalizeProject(version.snapshot, current);
    restored.ipReferences = await validateIpReferenceUpdate(userId, current.ipReferences, restored.ipReferences);
    try {
        const added = addedIpReferences(current.ipReferences, restored.ipReferences);
        if (added.length) await recordIpReferenceUsage(userId, { targetType: dramaUsageTarget(current), targetId: current.id, references: added });
        await createDramaProjectVersion(userId, projectId, "恢复前自动快照", current);
        const saved = await updateDramaProject(userId, restored, current.updatedAt);
        await cleanupOrphanDramaEpisodeCanvases(userId, saved.id, saved.episodes, current.episodes);
        return saved;
    } catch (error) {
        if (error instanceof DramaProjectStoreError) throw new DramaProjectServiceError(error.message, error.status);
        throw error;
    }
}

async function cleanupOrphanDramaEpisodeCanvases(userId: string, projectId: string, episodes: DramaEpisode[], previousEpisodes: DramaEpisode[] = []) {
    const activeEpisodeIds = new Set(episodes.map((episode) => episode.id));
    const orphanEpisodeIds = new Set(previousEpisodes.map((episode) => episode.id).filter((episodeId) => !activeEpisodeIds.has(episodeId)));
    let listedCanvases = 0;
    for (let page = 1; ; page += 1) {
        const result = await listDramaLabCanvasProjectsForUser(userId, { page, pageSize: 100 });
        for (const canvas of result.projects) {
            const binding = parseDramaLabEpisodeCanvasHandoffId(canvas.sourceHandoffId);
            if (binding?.projectId === projectId && !activeEpisodeIds.has(binding.episodeId)) orphanEpisodeIds.add(binding.episodeId);
        }
        listedCanvases += result.projects.length;
        if (!result.projects.length || listedCanvases >= result.total) break;
    }

    for (const episodeId of orphanEpisodeIds) await deleteDramaLabEpisodeCanvasForUser(userId, projectId, episodeId);
}

async function validateIpReferenceUpdate(userId: string, current: unknown, incoming: unknown) {
    await validateIpReferences(userId, current);
    return (await validateIpReferences(userId, incoming)).map((item) => item.reference);
}

function dramaUsageTarget(project: DramaProject) {
    return (project as DramaProject & { executionProfile?: string }).executionProfile === "open-source-practice" ? ("practice" as const) : ("drama" as const);
}

export async function deleteDramaProjectForUser(userId: string, id: string) {
    const projectId = cleanText(id);
    await getDramaProjectForUser(userId, projectId);
    let result: Awaited<ReturnType<typeof deleteDramaProjectCanvasAggregates>>;
    try {
        result = await deleteDramaProjectCanvasAggregates(userId, projectId);
    } catch (error) {
        if (error instanceof CreativeEntityDeletionConflict) throw new DramaProjectServiceError(error.message, 404);
        throw error;
    }
    if (!result.deletedDramaProjects) throw new DramaProjectServiceError("短剧项目不存在", 404);
    await deleteUserMediaAssetsCascade(userId, result.mediaStorageKeys);
}

export async function deleteDramaAgentConversationForUser(userId: string, projectIdValue: string, conversationIdValue: unknown) {
    const project = await getDramaProjectForUser(userId, projectIdValue);
    const conversationId = cleanText(conversationIdValue);
    if (!conversationId) throw new DramaProjectServiceError("请选择要删除的对话", 400);
    const conversation = await getCreativeConversation(conversationId, userId);
    if (!conversation || conversation.surface !== "drama" || conversation.projectId !== project.id) throw new DramaProjectServiceError("Agent 对话与当前短剧项目不匹配", 409);

    const activeRuns = await listAgentRuns({ userId, conversationId, surface: "drama", statuses: ["planning", "running", "paused"], limit: 1 });
    if (activeRuns.length) throw new DramaProjectServiceError("运行中的对话需先停止任务再删除", 409);

    let replacementConversationId: string | undefined;
    let createdReplacement = false;
    if (project.creativeConversationId === conversationId) {
        const candidates = await listCreativeConversations(userId, { surface: "drama", source: "drama", projectId: project.id, status: "active", limit: 2 });
        let replacement = candidates.find((item) => item.id !== conversationId);
        if (!replacement) {
            replacement = await createCreativeConversation(userId, { surface: "drama", source: "drama", projectId: project.id, title: "新对话" });
            createdReplacement = true;
        }
        replacementConversationId = replacement.id;
    }

    let result: Awaited<ReturnType<typeof deleteDramaConversationAggregate>>;
    try {
        result = await deleteDramaConversationAggregate(userId, project.id, conversationId, replacementConversationId);
    } catch (error) {
        if (createdReplacement && replacementConversationId) await updateCreativeConversation(replacementConversationId, userId, { status: "archived" }).catch(() => null);
        if (error instanceof CreativeEntityDeletionConflict) throw new DramaProjectServiceError(error.message, 409);
        throw error;
    }
    await deleteUserMediaAssetsCascade(userId, result.mediaStorageKeys);
    const updatedProject = result.dramaProject || project;
    return { deleted: result.deletedConversations > 0, activeConversationId: updatedProject.creativeConversationId || "", project: updatedProject };
}

function normalizeCreateInput(value: unknown): Required<Omit<CreateDramaProjectInput, "sourceAssets" | "sourceHandoffId">> & Pick<CreateDramaProjectInput, "sourceAssets" | "sourceHandoffId"> {
    const input = object(value);
    const title = cleanText(input.title);
    if (!title) throw new DramaProjectServiceError("项目名称不能为空", 400);
    const ratio = input.ratio === undefined ? "9:16" : normalizeDramaImageSize(input.ratio);
    if (!ratio) throw new DramaProjectServiceError("短剧尺寸无效", 400);
    return {
        title,
        sourceHandoffId: optionalText(input.sourceHandoffId),
        summary: cleanText(input.summary),
        style: cleanText(input.style) || "电影感国漫",
        storyStyle: cleanText(input.storyStyle),
        scriptType: cleanText(input.scriptType),
        ratio,
        initialScript: cleanText(input.initialScript),
        sourceAssets: normalizeSourceAssets(input.sourceAssets),
        defaultVideoMode: videoMode(input.defaultVideoMode),
        ipReferences: normalizeIpReferences(input.ipReferences),
    };
}

export function normalizeProject(value: unknown, current: DramaProject): DramaProject {
    const input = object(value);
    const episodes = array(input.episodes)
        .map((value, index) => normalizeEpisode(value, index))
        .filter((episode): episode is DramaEpisode => Boolean(episode));
    if (!episodes.length) throw new DramaProjectServiceError("短剧项目至少需要一集", 400);
    const activeEpisodeId = cleanText(input.activeEpisodeId);
    const ratio = input.ratio === undefined ? normalizeDramaImageSize(current.ratio) : normalizeDramaImageSize(input.ratio);
    if (!ratio) throw new DramaProjectServiceError("短剧尺寸无效", 400);
    return {
        id: current.id,
        sourceHandoffId: current.sourceHandoffId,
        title: cleanText(input.title) || current.title,
        summary: cleanText(input.summary),
        style: cleanText(input.style),
        storyStyle: input.storyStyle === undefined ? current.storyStyle : cleanText(input.storyStyle),
        scriptType: input.scriptType === undefined ? current.scriptType : cleanText(input.scriptType),
        ratio,
        status: input.status === "archived" ? "archived" : "active",
        creativeConversationId: current.creativeConversationId,
        activeEpisodeId: episodes.some((episode) => episode.id === activeEpisodeId) ? activeEpisodeId : episodes[0].id,
        characters: normalizeNamedAssets(input.characters, "character", true),
        scenes: normalizeNamedAssets(input.scenes, "scene"),
        props: normalizeNamedAssets(input.props, "prop"),
        clues: normalizeClues(input.clues),
        defaultVideoMode: videoMode(input.defaultVideoMode),
        episodes,
        sourceAssets: normalizeSourceAssets(input.sourceAssets),
        ipReferences: input.ipReferences === undefined ? current.ipReferences || [] : normalizeIpReferences(input.ipReferences),
        createdAt: current.createdAt,
        updatedAt: nextTimestamp(current.updatedAt),
    };
}

function addedIpReferences(previous: IpReference[] | undefined, next: IpReference[]) {
    const existing = new Set((previous || []).map(referenceKey));
    return next.filter((reference) => !existing.has(referenceKey(reference)));
}

function referenceKey(reference: IpReference) {
    return `${reference.id}:${reference.subIpId}:${reference.itemIds.join(",")}`;
}

function normalizeEpisode(value: unknown, index: number): DramaEpisode | null {
    const input = object(value);
    const id = cleanText(input.id);
    if (!id) return null;
    const render = object(input.renderTask);
    const renderStatus = render.status;
    const renderTask =
        cleanText(render.id) && ["pending", "running", "success", "error", "cancelled"].includes(String(renderStatus))
            ? {
                  id: cleanText(render.id),
                  status: renderStatus as "pending" | "running" | "success" | "error" | "cancelled",
                  result: stableUrl(object(render.result).url) ? { url: stableUrl(object(render.result).url) } : undefined,
                  error: optionalText(render.error),
              }
            : undefined;
    const script = cleanText(input.script);
    const scriptRichContent = normalizeDramaScriptRichContent(input.scriptRichContent);
    return {
        id,
        episodeNumber: optionalPositiveInteger(input.episodeNumber) || index + 1,
        title: cleanText(input.title) || "未命名剧集",
        script: scriptRichContent ? dramaRichContentToPlainText(scriptRichContent).trim() : script,
        scriptRichContent,
        outline: cleanText(input.outline),
        hook: cleanText(input.hook),
        nextPreview: cleanText(input.nextPreview),
        sourceRange: cleanText(input.sourceRange),
        reviewStatus: reviewStatus(input.reviewStatus),
        shots: array(input.shots).map(normalizeShot),
        renderTask,
        visualReview: normalizeVisualReview(input.visualReview),
    };
}

function normalizeVisualReview(value: unknown): DramaEpisode["visualReview"] {
    const input = object(value);
    const mode = input.mode === "visual" || input.mode === "text" || input.mode === "unavailable" ? input.mode : null;
    const status = input.status === "passed" || input.status === "needs_revision" || input.status === "unavailable" ? input.status : null;
    const summary = cleanText(input.summary);
    if (!mode || !status || !summary) return undefined;
    const scoreValue = Number(input.score);
    const issues = array(input.issues).flatMap((item) => {
        const issue = object(item);
        const category = cleanText(issue.category);
        const message = cleanText(issue.message);
        if (!category || !message) return [];
        const severity: "low" | "medium" | "high" = issue.severity === "high" || issue.severity === "medium" ? issue.severity : "low";
        return [
            {
                taskId: optionalText(issue.taskId),
                category,
                severity,
                message,
                correction: optionalText(issue.correction),
            },
        ];
    });
    return {
        mode,
        status: status || "idle",
        score: Number.isFinite(scoreValue) ? Math.max(0, Math.min(100, Math.round(scoreValue))) : undefined,
        summary,
        issues,
        retryTaskIds: ids(input.retryTaskIds),
    };
}

function normalizeShot(value: unknown, index: number): DramaShot {
    const input = object(value);
    return {
        id: cleanText(input.id) || `shot-${nanoid()}`,
        order: Math.max(1, Math.floor(Number(input.order) || index + 1)),
        title: cleanText(input.title) || `镜头 ${index + 1}`,
        description: cleanText(input.description),
        sourceText: cleanText(input.sourceText),
        shotBoundary: cleanText(input.shotBoundary),
        dialogue: cleanText(input.dialogue),
        narration: cleanText(input.narration),
        utterances: normalizeUtterances(input.utterances),
        imagePrompt: cleanText(input.imagePrompt),
        videoPrompt: cleanText(input.videoPrompt),
        cameraMotion: cleanText(input.cameraMotion),
        shotType: optionalText(input.shotType),
        segmentIndex: optionalPositiveInteger(input.segmentIndex),
        segmentTitle: optionalText(input.segmentTitle),
        atmosphere: optionalText(input.atmosphere),
        lightingStyle: optionalText(input.lightingStyle),
        depthOfField: optionalText(input.depthOfField),
        creationMode: input.creationMode === "universal" ? "universal" : "classic",
        universalSegmentText: optionalText(input.universalSegmentText),
        polishedPrompt: optionalText(input.polishedPrompt),
        cameraAngle: optionalText(input.cameraAngle),
        angleH: optionalText(input.angleH),
        angleV: optionalText(input.angleV),
        angleS: optionalText(input.angleS),
        location: optionalText(input.location),
        time: optionalText(input.time),
        action: optionalText(input.action),
        result: optionalText(input.result),
        emotion: optionalText(input.emotion),
        emotionIntensity: Number.isFinite(Number(input.emotionIntensity)) ? Math.max(-1, Math.min(3, Math.round(Number(input.emotionIntensity)))) : undefined,
        layoutDescription: optionalText(input.layoutDescription),
        frames: normalizeFrameStates(input.frames),
        firstFrameCandidate: normalizeFrameCandidate(input.firstFrameCandidate),
        videoFrameSnapshot: normalizeVideoFrameSnapshot(input.videoFrameSnapshot),
        startFramePrompt: optionalText(input.startFramePrompt),
        endFramePrompt: optionalText(input.endFramePrompt),
        negativePrompt: optionalText(input.negativePrompt),
        continuity: normalizeContinuity(input.continuity),
        duration: resolveDramaShotDuration(input.duration, 5),
        characterIds: array(input.characterIds)
            .map((id) => cleanText(id))
            .filter(Boolean),
        propIds: ids(input.propIds),
        clueIds: ids(input.clueIds),
        sceneId: optionalText(input.sceneId),
        videoMode: videoMode(input.videoMode),
        storyboardFrameMode: input.storyboardFrameMode === "first_last" ? "first_last" : "single",
        storyboardStatus: taskStatus(input.storyboardStatus),
        storyboardAttempt: optionalPositiveInteger(input.storyboardAttempt),
        storyboardTaskId: optionalText(input.storyboardTaskId),
        storyboardError: optionalText(input.storyboardError),
        storyboardImageUrl: stableUrl(input.storyboardImageUrl),
        storyboardImageWidth: optionalPositiveInteger(input.storyboardImageWidth),
        storyboardImageHeight: optionalPositiveInteger(input.storyboardImageHeight),
        storyboardHistory: normalizeGenerationHistory(input.storyboardHistory),
        storyboardEndStatus: taskStatus(input.storyboardEndStatus),
        storyboardEndAttempt: optionalPositiveInteger(input.storyboardEndAttempt),
        storyboardEndTaskId: optionalText(input.storyboardEndTaskId),
        storyboardEndError: optionalText(input.storyboardEndError),
        storyboardEndImageUrl: stableUrl(input.storyboardEndImageUrl),
        storyboardEndImageWidth: optionalPositiveInteger(input.storyboardEndImageWidth),
        storyboardEndImageHeight: optionalPositiveInteger(input.storyboardEndImageHeight),
        generationStatus: taskStatus(input.generationStatus),
        generationAttempt: optionalPositiveInteger(input.generationAttempt),
        generationTaskId: optionalText(input.generationTaskId),
        generationNeedsReview: input.generationNeedsReview === true ? true : undefined,
        generationError: optionalText(input.generationError),
        videoUrl: stableUrl(input.videoUrl),
        videoHistory: normalizeGenerationHistory(input.videoHistory),
        subtitle: optionalText(input.subtitle),
        audioMode: input.audioMode === "voiceover" || input.audioMode === "mute" ? input.audioMode : "source",
        audioStatus: taskStatus(input.audioStatus),
        audioAttempt: optionalPositiveInteger(input.audioAttempt),
        audioTaskId: optionalText(input.audioTaskId),
        audioError: optionalText(input.audioError),
        audioUrl: stableUrl(input.audioUrl),
        dialogueAudio: normalizeAudioState(input.dialogueAudio),
        narrationAudio: normalizeAudioState(input.narrationAudio),
        audioSplitSourceShotId: optionalText(input.audioSplitSourceShotId),
        audioSplitSegmentIndex: optionalNonNegativeInteger(input.audioSplitSegmentIndex),
    };
}

function normalizeAudioState(value: unknown) {
    if (!value || typeof value !== "object") return undefined;
    const input = value as Record<string, unknown>;
    const url = stableUrl(input.url);
    const status = taskStatus(input.status) || (url ? "success" : "idle");
    return {
        status,
        attempt: optionalPositiveInteger(input.attempt),
        taskId: optionalText(input.taskId),
        error: optionalText(input.error),
        url,
        mimeType: optionalText(input.mimeType),
        speaker: optionalText(input.speaker),
        voice: optionalText(input.voice),
        speed: Number.isFinite(Number(input.speed)) ? Math.max(0.25, Math.min(4, Number(input.speed))) : undefined,
        instructions: optionalText(input.instructions),
        durationMs: optionalPositiveInteger(input.durationMs),
    };
}

function normalizeNamedAssets(value: unknown, prefix: string, character = false): DramaNamedAsset[] {
    return array(value)
        .map((item) => {
            const input = object(item);
            const id = cleanText(input.id) || `${prefix}-${nanoid()}`;
            const references = normalizeAssetReferences(input.references, id, input.referenceImageUrl, input.referenceStorageKey);
            const primaryReferenceId = references.some((reference) => reference.id === input.primaryReferenceId) ? String(input.primaryReferenceId) : references[0]?.id;
            const primaryReference = references.find((reference) => reference.id === primaryReferenceId);
            return {
                id,
                name: cleanText(input.name),
                description: cleanText(input.description),
                ...Object.fromEntries(
                    ["appearance", "imagePrompt", "polishedPrompt", "singleImagePrompt", "generationLayout", "role", "type", "time"].flatMap((key) => {
                        const value = optionalText(input[key]);
                        return value ? [[key, value]] : [];
                    }),
                ),
                profile: normalizeAssetProfile(input.profile),
                stages: normalizeAssetStages(input.stages),
                references,
                primaryReferenceId,
                referenceImageUrl: primaryReference?.url,
                referenceStorageKey: primaryReference?.storageKey,
                ...(character ? { voiceProfile: normalizeVoiceProfile(input.voiceProfile) } : {}),
            };
        })
        .filter((item) => item.name);
}

function normalizeClues(value: unknown) {
    return array(value).flatMap((item) => {
        const input = object(item);
        const name = cleanText(input.name);
        if (!name) return [];
        const id = cleanText(input.id) || `clue-${nanoid()}`;
        const references = normalizeAssetReferences(input.references, id, input.referenceImageUrl, input.referenceStorageKey);
        const primaryReferenceId = references.some((reference) => reference.id === input.primaryReferenceId) ? String(input.primaryReferenceId) : references[0]?.id;
        const primaryReference = references.find((reference) => reference.id === primaryReferenceId);
        return [
            {
                id,
                name,
                description: cleanText(input.description),
                profile: normalizeAssetProfile(input.profile),
                references,
                primaryReferenceId,
                payoff: cleanText(input.payoff),
                referenceImageUrl: primaryReference?.url,
                referenceStorageKey: primaryReference?.storageKey,
            },
        ];
    });
}

function normalizeAssetStages(value: unknown) {
    if (!Array.isArray(value)) return undefined;
    const stages = value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const input = item as Record<string, unknown>;
        const range = Array.isArray(input.episodeRange) ? input.episodeRange.map(Number) : [];
        const appearance = typeof input.appearance === "string" ? input.appearance.trim() : "";
        if (range.length !== 2 || !Number.isFinite(range[0]) || !Number.isFinite(range[1]) || range[0] < 1 || range[1] < range[0] || !appearance) return [];
        return [{ episodeRange: [Math.floor(range[0]), Math.floor(range[1])] as [number, number], appearance: appearance.slice(0, 4000) }];
    });
    return stages.length ? stages : undefined;
}

function normalizeAssetProfile(value: unknown): DramaAssetProfile {
    const input = object(value);
    return {
        visualIdentity: cleanText(input.visualIdentity),
        styling: cleanText(input.styling),
        colorPalette: cleanText(input.colorPalette),
        consistencyRules: cleanText(input.consistencyRules),
    };
}

function normalizeAssetReferences(value: unknown, assetId: string, legacyUrl: unknown, legacyStorageKey: unknown): DramaAssetReference[] {
    const references = array(value).flatMap((item, index) => {
        const input = object(item);
        const url = stableUrl(input.url);
        if (!url) return [];
        const source: DramaAssetReference["source"] = input.source === "generated" || input.source === "library" ? input.source : "upload";
        return [
            {
                id: cleanText(input.id) || `${assetId}-reference-${index + 1}`,
                url,
                storageKey: optionalText(input.storageKey),
                source,
                label: cleanText(input.label) || `参考图 ${index + 1}`,
                width: optionalPositiveInteger(input.width),
                height: optionalPositiveInteger(input.height),
                createdAt: timestamp(input.createdAt) || new Date(0).toISOString(),
            },
        ];
    });
    const url = stableUrl(legacyUrl);
    if (!references.length && url) references.push({ id: `${assetId}-reference-legacy`, url, storageKey: optionalText(legacyStorageKey), source: "library", label: "原参考图", width: undefined, height: undefined, createdAt: new Date(0).toISOString() });
    return references;
}

function normalizeVoiceProfile(value: unknown) {
    const input = object(value);
    return {
        voice: cleanText(input.voice),
        speed: Math.max(0.25, Math.min(4, Number(input.speed) || 1)),
        instructions: cleanText(input.instructions),
    };
}

function normalizeContinuity(value: unknown): DramaShotContinuity {
    const input = object(value);
    return {
        shotSize: cleanText(input.shotSize),
        cameraAngle: cleanText(input.cameraAngle),
        composition: cleanText(input.composition),
        characterBlocking: cleanText(input.characterBlocking),
        gazeDirection: cleanText(input.gazeDirection),
        actionStart: cleanText(input.actionStart),
        actionEnd: cleanText(input.actionEnd),
        screenDirection: cleanText(input.screenDirection),
        axisRule: cleanText(input.axisRule),
        continuityNotes: cleanText(input.continuityNotes),
    };
}

function normalizeUtterances(value: unknown): DramaUtterance[] {
    return array(value)
        .map((item, index) => {
            const input = object(item);
            return {
                id: cleanText(input.id) || `utterance-${nanoid()}`,
                order: Math.max(1, Math.floor(Number(input.order) || index + 1)),
                type: input.type === "voiceover" ? "voiceover" : "dialogue",
                speaker: cleanText(input.speaker),
                text: cleanText(input.text),
            } as DramaUtterance;
        })
        .filter((item) => item.text);
}

function normalizeGenerationHistory(value: unknown) {
    return array(value)
        .flatMap((item) => {
            const input = object(item);
            const id = cleanText(input.id);
            const taskId = cleanText(input.taskId);
            const url = stableUrl(input.url);
            if (!id || !taskId || !url) return [];
            return [
                {
                    id,
                    taskId,
                    url,
                    prompt: cleanText(input.prompt),
                    createdAt: timestamp(input.createdAt) || new Date(0).toISOString(),
                    width: optionalPositiveInteger(input.width),
                    height: optionalPositiveInteger(input.height),
                },
            ];
        })
        .slice(-20);
}

function normalizeFrameStates(value: unknown) {
    const input = object(value);
    const frames = (["first", "key", "last"] as const).reduce(
        (result, type) => {
            const frame = object(input[type]);
            if (!frame) return result;
            const status = taskStatus(frame.status);
            const prompt = cleanText(frame.prompt);
            if (!prompt && !stableUrl(frame.url) && status === "idle") return result;
            result[type] = {
                prompt,
                description: optionalText(frame.description),
                status,
                taskId: optionalText(frame.taskId),
                attempt: optionalPositiveInteger(frame.attempt),
                url: stableUrl(frame.url),
                width: optionalPositiveInteger(frame.width),
                height: optionalPositiveInteger(frame.height),
                error: optionalText(frame.error),
                history: normalizeGenerationHistory(frame.history),
                storageKey: optionalText(frame.storageKey),
                source: frameSource(frame.source),
                sourceVideoTaskId: optionalText(frame.sourceVideoTaskId),
                sourceShotId: optionalText(frame.sourceShotId),
                sourceVideoHistoryId: optionalText(frame.sourceVideoHistoryId),
                locked: typeof frame.locked === "boolean" ? frame.locked : undefined,
            };
            return result;
        },
        {} as Record<string, unknown>,
    );
    return Object.keys(frames).length ? frames : undefined;
}

function normalizeFrameCandidate(value: unknown): DramaShotFrameCandidate | undefined {
    const input = object(value);
    const id = cleanText(input.id);
    const url = stableUrl(input.url);
    const sourceVideoTaskId = cleanText(input.sourceVideoTaskId);
    const sourceShotId = cleanText(input.sourceShotId);
    const sourceVideoHistoryId = cleanText(input.sourceVideoHistoryId);
    const createdAt = timestamp(input.createdAt);
    const projectUpdatedAt = timestamp(input.projectUpdatedAt);
    if (!id || !url || !sourceVideoTaskId || !sourceShotId || !sourceVideoHistoryId || !createdAt || !projectUpdatedAt) return undefined;
    return {
        id,
        frameType: "first",
        url,
        storageKey: optionalText(input.storageKey),
        width: optionalPositiveInteger(input.width),
        height: optionalPositiveInteger(input.height),
        source: "video_tail",
        sourceVideoTaskId,
        sourceShotId,
        sourceVideoHistoryId,
        createdAt,
        projectUpdatedAt,
    };
}

function frameSource(value: unknown): DramaShotFrameSource | undefined {
    return value === "generated" || value === "uploaded" || value === "video_tail" || value === "restored" ? value : undefined;
}

function normalizeVideoFrameSnapshot(value: unknown): DramaShotVideoFrameSnapshot | undefined {
    const input = object(value);
    const capturedAt = timestamp(input.capturedAt);
    if (!capturedAt || typeof input.supportsLastFrame !== "boolean") return undefined;
    const references = array(input.references).flatMap((item) => {
        const reference = object(item);
        const role = reference.role === "first_frame" || reference.role === "last_frame" || reference.role === "reference" ? (reference.role as DramaShotVideoFrameSnapshot["references"][number]["role"]) : undefined;
        const url = stableUrl(reference.url);
        if (!role || !url) return [];
        const frameType = reference.frameType === "first" || reference.frameType === "key" || reference.frameType === "last" ? (reference.frameType as DramaShotFrameType) : undefined;
        return [
            {
                role,
                frameType,
                url,
                storageKey: optionalText(reference.storageKey),
                taskId: optionalText(reference.taskId),
                source: frameSource(reference.source),
                sourceVideoTaskId: optionalText(reference.sourceVideoTaskId),
                sourceShotId: optionalText(reference.sourceShotId),
                sourceVideoHistoryId: optionalText(reference.sourceVideoHistoryId),
            },
        ];
    });
    if (!references.length) return undefined;
    return {
        capturedAt,
        model: optionalText(input.model),
        supportsFirstFrame: typeof input.supportsFirstFrame === "boolean" ? input.supportsFirstFrame : undefined,
        supportsLastFrame: input.supportsLastFrame,
        maxReferenceImages: optionalPositiveInteger(input.maxReferenceImages),
        fallbackReason: optionalText(input.fallbackReason),
        references,
    };
}

function ids(value: unknown) {
    return array(value)
        .map((id) => cleanText(id))
        .filter(Boolean);
}

function reviewStatus(value: unknown): DramaEpisode["reviewStatus"] {
    return value === "content_review" || value === "approved" || value === "visual_ready" ? value : "draft";
}

function videoMode(value: unknown): DramaVideoMode {
    return value === "direct" || value === "reference" ? value : "storyboard";
}

function normalizeSourceAssets(value: unknown) {
    return array(value).map((item) => {
        const asset = object(item);
        const type = ["text", "image", "video", "audio"].includes(String(asset.type)) ? (asset.type as "text" | "image" | "video" | "audio") : "text";
        return {
            id: cleanText(asset.id) || `source-${nanoid()}`,
            type,
            title: cleanText(asset.title) || "创作素材",
            textContent: type === "text" ? optionalText(asset.textContent) : undefined,
            storageKey: optionalText(asset.storageKey),
            remoteUrl: stableUrl(asset.remoteUrl),
            serverUrl: stableUrl(asset.serverUrl),
            mimeType: optionalText(asset.mimeType),
            width: optionalPositiveInteger(asset.width),
            height: optionalPositiveInteger(asset.height),
        };
    });
}

function taskStatus(value: unknown) {
    return ["idle", "queued", "pending", "running", "success", "error", "cancelled"].includes(String(value)) ? (value as DramaShot["generationStatus"]) : undefined;
}

function optionalPositiveInteger(value: unknown) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number > 0 ? number : undefined;
}

function optionalNonNegativeInteger(value: unknown) {
    const number = Math.floor(Number(value));
    return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function stableUrl(value: unknown) {
    const text = cleanText(value);
    return text && !text.startsWith("data:") && !text.startsWith("blob:") ? text : undefined;
}

function optionalText(value: unknown) {
    return cleanText(value) || undefined;
}

function cleanText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function parseTimestamp(value: unknown) {
    const time = Date.parse(String(value || ""));
    return Number.isFinite(time) ? time : 0;
}

function nextTimestamp(previous: string) {
    return new Date(Math.max(Date.now(), parseTimestamp(previous) + 1)).toISOString();
}

function timestamp(value: unknown) {
    const time = parseTimestamp(value);
    return time ? new Date(time).toISOString() : "";
}

function object(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}
