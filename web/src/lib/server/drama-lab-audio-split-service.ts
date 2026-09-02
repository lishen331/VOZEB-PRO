import type { DramaEpisode, DramaProject, DramaShot, DramaTaskStatus, DramaUtterance } from "@/lib/drama-project-contract";
import { DramaProjectStoreError, updateDramaProject } from "@/lib/server/drama-project-store";

/** Domain validation error for the preview/apply split-by-audio contract. */
export class DramaLabAudioSplitError extends Error {
    constructor(message: string, readonly status = 400) {
        super(message);
    }
}

export type DramaAudioSplitCue = {
    /** Zero-based candidate index. */
    index?: number;
    /** A persisted utterance id is preferred over an index when available. */
    utteranceId?: string;
    durationMs?: number;
    startMs?: number;
    endMs?: number;
};

export type DramaAudioSplitOptions = {
    /** Total measured duration of the source audio track. */
    totalDurationMs?: number;
    /** Measured duration for the dialogue track, when it is separate. */
    dialogueDurationMs?: number;
    /** Measured duration for the narration track, when it is separate. */
    narrationDurationMs?: number;
    /** Optional ASR/beat boundaries supplied by the audio analyser. */
    cues?: DramaAudioSplitCue[];
    /** Clip bounds used only for generated candidate shot durations. */
    minSegmentDurationMs?: number;
    maxSegmentDurationMs?: number;
};

export type DramaAudioSplitSegment = {
    index: number;
    kind: "dialogue" | "narration";
    speaker?: string;
    text: string;
    /** Rounded seconds consumed by the video clip contract. */
    duration: number;
    /** Measured/estimated speech duration before clip rounding. */
    durationMs: number;
    startMs: number;
    endMs: number;
    durationSource: "audio" | "rhythm" | "estimated";
    utterances: DramaUtterance[];
    /** Stable id used when the candidate is persisted. */
    candidateId: string;
};

export type DramaAudioSplitPlan = {
    sourceShotId: string;
    sourceShotTitle: string;
    /** Detects edits made after a preview was generated. */
    sourceFingerprint: string;
    segments: DramaAudioSplitSegment[];
    totalDurationMs: number;
    options?: DramaAudioSplitOptions;
};

export type DramaAudioSplitApplyResult = {
    project: DramaProject;
    sourceShotId: string;
    createdShots: DramaShot[];
    skippedSegmentIndexes: number[];
    preservedShotIds: string[];
};

type SourceEntry = {
    kind: DramaAudioSplitSegment["kind"];
    speaker: string;
    text: string;
    utterances: DramaUtterance[];
    order: number;
    sourceIndex: number;
};

const DEFAULT_MIN_SEGMENT_MS = 1_000;
const DEFAULT_MAX_SEGMENT_MS = 120_000;
const MAX_CUES = 500;

/**
 * Build a deterministic candidate plan from persisted dialogue/voiceover text.
 * No model, task or database is touched here. Callers should present this
 * plan to the user and send it back to the apply endpoint explicitly.
 */
export function planDramaAudioSplit(shot: DramaShot, input: DramaAudioSplitOptions = {}): DramaAudioSplitPlan {
    assertAudioSplitSourceEligible(shot);
    const options = normalizeDramaAudioSplitOptions(input);
    const entries = sourceEntries(shot);
    const dialogueCount = entries.filter((entry) => entry.kind === "dialogue").length;
    if (entries.length < 2) throw new DramaLabAudioSplitError("当前镜头只有一段对白或旁白，无需按音频拆镜", 409);
    if (!dialogueCount && entries.some((entry) => entry.kind === "narration")) throw new DramaLabAudioSplitError("仅有旁白时无法按对白拆镜", 409);

    const durations = allocateDurations(entries, options);
    let cursor = 0;
    const segments = entries.map((entry, index) => {
        const durationMs = durations[index].durationMs;
        const startMs = cursor;
        const endMs = startMs + durationMs;
        cursor = endMs;
        return {
            index,
            kind: entry.kind,
            ...(entry.speaker ? { speaker: entry.speaker } : {}),
            text: entry.text,
            duration: Math.max(1, Math.round(durationMs / 1_000)),
            durationMs,
            startMs,
            endMs,
            durationSource: durations[index].source,
            utterances: entry.utterances.map((utterance, utteranceIndex) => ({ ...utterance, order: utteranceIndex + 1 })),
            candidateId: audioSplitCandidateId(shot.id, index),
        } satisfies DramaAudioSplitSegment;
    });

    return {
        sourceShotId: shot.id,
        sourceShotTitle: shot.title,
        sourceFingerprint: dramaAudioSplitSourceFingerprint(shot),
        segments,
        totalDurationMs: cursor,
        ...(Object.keys(options).length ? { options } : {}),
    };
}

/** Stable candidate identity; repeated confirmations never create duplicates. */
export function audioSplitCandidateId(sourceShotId: string, segmentIndex: number) {
    return `shot-${sourceShotId}-audio-split-${Math.max(0, Math.floor(segmentIndex)) + 1}`;
}

/**
 * A compact, deterministic fingerprint for the source fields that drive the
 * split. It intentionally includes audio metadata so a new recording cannot
 * silently apply an old preview.
 */
export function dramaAudioSplitSourceFingerprint(shot: DramaShot) {
    const utterances = (Array.isArray(shot.utterances) ? shot.utterances : [])
        .map((item, index) => `${index}:${item.id}:${item.order}:${item.type}:${item.speaker}:${item.text}`)
        .join("\u001f");
    const audioState = (value: DramaShot["dialogueAudio"] | DramaShot["narrationAudio"] | undefined) =>
        value ? [value.url, value.durationMs, value.mimeType].join("\u001f") : "";
    const payload = [
        shot.id,
        shot.title,
        shot.dialogue,
        shot.narration,
        utterances,
        shot.subtitle ?? "",
        shot.audioMode ?? "",
        audioState(shot.dialogueAudio),
        audioState(shot.narrationAudio),
        shot.audioUrl ?? "",
    ].join("\u001e");
    let hash = 2_166_136_261;
    for (const character of payload) {
        hash ^= character.codePointAt(0) || 0;
        hash = Math.imul(hash, 16_777_619);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
}

/**
 * Validate a client-submitted preview before writing. Text, speaker, kind and
 * utterance ids are recomputed from the current shot; only measured durations
 * may differ within the declared clip bounds.
 */
export function validateDramaAudioSplitPlan(shot: DramaShot, value: unknown, input: DramaAudioSplitOptions = {}) {
    assertAudioSplitSourceEligible(shot);
    const candidate = asRecord(value);
    if (!candidate || candidate.sourceShotId !== shot.id) throw new DramaLabAudioSplitError("拆镜计划与当前镜头不匹配", 409);
    const fingerprint = typeof candidate.sourceFingerprint === "string" ? candidate.sourceFingerprint : "";
    if (fingerprint !== dramaAudioSplitSourceFingerprint(shot)) throw new DramaLabAudioSplitError("当前镜头内容已变化，请重新生成拆镜预览", 409);
    if (!Array.isArray(candidate.segments)) throw new DramaLabAudioSplitError("拆镜计划缺少候选片段", 400);

    const options = normalizeDramaAudioSplitOptions(input);
    const expected = planDramaAudioSplit(shot, options);
    if (candidate.segments.length !== expected.segments.length) throw new DramaLabAudioSplitError("拆镜候选数量与当前镜头内容不一致", 409);
    const normalizedSegments = candidate.segments.map((raw, index) => normalizeSubmittedSegment(raw, index, expected.segments[index], options));
    let cursor = 0;
    const canonicalSegments = normalizedSegments.map((segment) => {
        const startMs = cursor;
        const endMs = startMs + segment.durationMs;
        cursor = endMs;
        return { ...segment, startMs, endMs, durationSource: expected.segments[segment.index].durationSource };
    });
    const maxTotalMs = Math.max(3_600_000, expected.totalDurationMs);
    if (cursor > maxTotalMs) throw new DramaLabAudioSplitError("拆镜候选总时长超过允许范围", 400);
    return {
        sourceShotId: shot.id,
        sourceShotTitle: shot.title,
        sourceFingerprint: dramaAudioSplitSourceFingerprint(shot),
        segments: canonicalSegments,
        totalDurationMs: cursor,
        ...(Object.keys(options).length ? { options } : {}),
    } satisfies DramaAudioSplitPlan;
}

/** Backwards-compatible convenience wrapper returning only the saved project. */
export async function applyDramaAudioSplit(input: {
    userId: string;
    projectOwnerUserId?: string;
    project: DramaProject;
    episodeId: string;
    shotId: string;
    plan: DramaAudioSplitPlan;
    expectedUpdatedAt?: string;
}) {
    return (await applyDramaAudioSplitDetailed(input)).project;
}

/**
 * Append candidates without rewriting the source or renumbering any existing
 * shot. This is deliberate: a user may have manually edited a neighbouring
 * shot, and changing its order or fields would be data loss. Existing split
 * candidates (including ones manually edited after creation) are retained.
 */
export async function applyDramaAudioSplitDetailed(input: {
    userId: string;
    projectOwnerUserId?: string;
    project: DramaProject;
    episodeId: string;
    shotId: string;
    plan: DramaAudioSplitPlan;
    expectedUpdatedAt?: string;
}) {
    const episode = findEpisode(input.project, input.episodeId);
    const sourceIndex = episode.shots.findIndex((shot) => shot.id === input.shotId);
    if (sourceIndex < 0) throw new DramaLabAudioSplitError("短剧镜头不存在", 404);
    const source = episode.shots[sourceIndex];
    assertAudioSplitSourceEligible(source);
    if (source.audioSplitSourceShotId) throw new DramaLabAudioSplitError("不能继续拆分已由音频候选生成的镜头", 409);
    const plan = validateDramaAudioSplitPlan(source, input.plan, input.plan.options || {});

    const existingById = new Map(episode.shots.map((shot) => [shot.id, shot]));
    const existingBySegment = new Map<number, DramaShot>();
    for (const shot of episode.shots) {
        if (shot.audioSplitSourceShotId !== input.shotId || shot.audioSplitSegmentIndex === undefined) continue;
        existingBySegment.set(shot.audioSplitSegmentIndex, shot);
    }

    const created: DramaShot[] = [];
    const skippedSegmentIndexes: number[] = [];
    const sourceSpeakers = sourceDialogueSpeakers(source);
    let nextOrder = episode.shots.reduce((max, shot) => Math.max(max, Number.isFinite(shot.order) ? shot.order : 0), 0) + 1;
    for (const segment of plan.segments) {
        const existing = existingBySegment.get(segment.index);
        if (existing) {
            skippedSegmentIndexes.push(segment.index);
            continue;
        }
        const candidateId = audioSplitCandidateId(input.shotId, segment.index);
        const collision = existingById.get(candidateId);
        if (collision) throw new DramaLabAudioSplitError("拆镜候选 ID 与现有镜头冲突，请刷新后重试", 409);
        const candidate = createSegmentShot(source, segment, nextOrder++, sourceSpeakers);
        existingById.set(candidate.id, candidate);
        created.push(candidate);
    }
    if (!created.length) {
        return { project: input.project, sourceShotId: input.shotId, createdShots: [], skippedSegmentIndexes, preservedShotIds: episode.shots.map((shot) => shot.id) } satisfies DramaAudioSplitApplyResult;
    }

    const nextEpisode: DramaEpisode = { ...episode, shots: [...episode.shots, ...created] };
    const nextProject: DramaProject = {
        ...input.project,
        episodes: input.project.episodes.map((item) => (item.id === nextEpisode.id ? nextEpisode : item)),
        updatedAt: new Date().toISOString(),
    };
    try {
        const saved = await updateDramaProject(input.projectOwnerUserId || input.userId, nextProject, input.expectedUpdatedAt || input.project.updatedAt);
        return { project: saved, sourceShotId: input.shotId, createdShots: created, skippedSegmentIndexes, preservedShotIds: episode.shots.map((shot) => shot.id) } satisfies DramaAudioSplitApplyResult;
    } catch (error) {
        if (error instanceof DramaProjectStoreError) throw new DramaLabAudioSplitError(error.message, error.status);
        throw error;
    }
}

/** Find an owned episode shot for the route layer without exposing store details. */
export function findDramaAudioSplitShot(project: DramaProject, episodeId: string, shotId: string) {
    const episode = findEpisode(project, episodeId);
    const shot = episode.shots.find((item) => item.id === shotId);
    if (!shot) throw new DramaLabAudioSplitError("短剧镜头不存在", 404);
    return { episode, shot };
}

export function normalizeDramaAudioSplitOptions(value: unknown): DramaAudioSplitOptions {
    const input = asRecord(value) || {};
    const options: DramaAudioSplitOptions = {};
    const totalDurationMs = positiveNumber(input.totalDurationMs);
    const dialogueDurationMs = positiveNumber(input.dialogueDurationMs);
    const narrationDurationMs = positiveNumber(input.narrationDurationMs);
    const minSegmentDurationMs = positiveNumber(input.minSegmentDurationMs);
    const maxSegmentDurationMs = positiveNumber(input.maxSegmentDurationMs);
    if (totalDurationMs) options.totalDurationMs = Math.min(totalDurationMs, 3_600_000);
    if (dialogueDurationMs) options.dialogueDurationMs = Math.min(dialogueDurationMs, 3_600_000);
    if (narrationDurationMs) options.narrationDurationMs = Math.min(narrationDurationMs, 3_600_000);
    if (minSegmentDurationMs) options.minSegmentDurationMs = Math.max(100, Math.min(minSegmentDurationMs, DEFAULT_MAX_SEGMENT_MS));
    if (maxSegmentDurationMs) options.maxSegmentDurationMs = Math.max(options.minSegmentDurationMs || DEFAULT_MIN_SEGMENT_MS, Math.min(maxSegmentDurationMs, 3_600_000));
    const cues = Array.isArray(input.cues)
        ? input.cues.slice(0, MAX_CUES).flatMap((item) => {
              const cue = asRecord(item);
              if (!cue) return [];
              const normalized: DramaAudioSplitCue = {};
              const index = nonNegativeInteger(cue.index);
              const utteranceId = cleanText(cue.utteranceId);
              const duration = positiveNumber(cue.durationMs);
              const start = nonNegativeNumber(cue.startMs);
              const end = positiveNumber(cue.endMs);
              if (index !== undefined) normalized.index = index;
              if (utteranceId) normalized.utteranceId = utteranceId.slice(0, 200);
              if (duration) normalized.durationMs = Math.min(duration, 3_600_000);
              if (start !== undefined) normalized.startMs = Math.min(start, 3_600_000);
              if (end) normalized.endMs = Math.min(end, 3_600_000);
              return Object.keys(normalized).length ? [normalized] : [];
          })
        : [];
    if (cues.length) options.cues = cues;
    return options;
}

function sourceEntries(shot: DramaShot): SourceEntry[] {
    const utterances = (Array.isArray(shot.utterances) ? shot.utterances : [])
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => (item.type === "dialogue" || item.type === "voiceover") && cleanText(item.text))
        .sort((left, right) => utteranceOrder(left.item, left.index) - utteranceOrder(right.item, right.index) || left.index - right.index);
    const dialogueUtterances = utterances.filter(({ item }) => item.type === "dialogue");
    const narrationUtterances = utterances.filter(({ item }) => item.type === "voiceover");
    const parsedDialogue = parseDialogueLines(shot.dialogue);

    // Persisted utterances are authoritative. For legacy rows where one
    // utterance accidentally contains several labelled lines, prefer the
    // lossless line parser so no speaker's text disappears.
    const useParsedDialogue = parsedDialogue.length > dialogueUtterances.length;
    const entries: SourceEntry[] = [];
    if (useParsedDialogue) {
        parsedDialogue.forEach((item, index) => entries.push({ kind: "dialogue", speaker: item.speaker, text: item.text, utterances: [fallbackUtterance(shot.id, "dialogue", index, item.speaker, item.text)], order: index + 1, sourceIndex: index }));
    } else {
        dialogueUtterances.forEach(({ item, index }) => entries.push({ kind: "dialogue", speaker: cleanText(item.speaker), text: cleanText(item.text), utterances: [{ ...item, speaker: cleanText(item.speaker), text: cleanText(item.text) }], order: Number(item.order) || index + 1, sourceIndex: index }));
        if (!dialogueUtterances.length && parsedDialogue.length) parsedDialogue.forEach((item, index) => entries.push({ kind: "dialogue", speaker: item.speaker, text: item.text, utterances: [fallbackUtterance(shot.id, "dialogue", index, item.speaker, item.text)], order: index + 1, sourceIndex: index }));
    }

    if (narrationUtterances.length) {
        narrationUtterances.forEach(({ item, index }) => entries.push({ kind: "narration", speaker: "", text: cleanText(item.text), utterances: [{ ...item, type: "voiceover", speaker: "", text: cleanText(item.text) }], order: Number(item.order) || entries.length + index + 1, sourceIndex: index }));
    } else if (cleanText(shot.narration)) {
        entries.push({ kind: "narration", speaker: "", text: cleanText(shot.narration), utterances: [fallbackUtterance(shot.id, "narration", 0, "", cleanText(shot.narration))], order: entries.length + 1, sourceIndex: 0 });
    }
    return entries
        .filter((entry) => entry.text)
        .sort((left, right) => left.order - right.order || left.sourceIndex - right.sourceIndex)
        .map((entry, index) => ({ ...entry, order: index + 1 }));
}

function parseDialogueLines(value: string) {
    const lines = cleanText(value).split(/\r?\n+/u).map((line) => line.trim()).filter(Boolean);
    const result: Array<{ speaker: string; text: string }> = [];
    for (const line of lines) {
        const match = line.match(/^([^：:\n]{1,80})\s*[：:]\s*(.+)$/u);
        if (match) {
            result.push({ speaker: match[1].trim(), text: match[2].trim() });
        } else if (result.length && !/[。！？!?]$/u.test(result[result.length - 1].text)) {
            result[result.length - 1].text = `${result[result.length - 1].text}\n${line}`;
        } else {
            result.push({ speaker: "", text: line });
        }
    }
    return result;
}

function fallbackUtterance(shotId: string, kind: "dialogue" | "narration", index: number, speaker: string, text: string): DramaUtterance {
    return { id: `utterance-${shotId}-${kind}-${index + 1}`, order: 1, type: kind === "narration" ? "voiceover" : "dialogue", speaker, text };
}

function allocateDurations(entries: SourceEntry[], options: DramaAudioSplitOptions) {
    const cues = options.cues || [];
    const explicit = entries.map((entry, index) => {
        const cue = matchingCue(cues, entry, index);
        const duration = cueDurationMs(cue);
        return { durationMs: duration || estimateSpeechDurationMs(entry.text, entry.kind), source: duration ? (cue?.startMs !== undefined || cue?.endMs !== undefined ? "rhythm" : "audio") : "estimated" } as const;
    });

    const applyGroupDuration = (kind: SourceEntry["kind"], target: number | undefined) => {
        if (!target || target <= 0) return;
        const indexes = entries.map((entry, index) => (entry.kind === kind ? index : -1)).filter((index) => index >= 0);
        if (!indexes.length) return;
        const fixed = indexes.filter((index) => cues.some((cue) => matchingCue([cue], entries[index], index) && cueDurationMs(cue)));
        const flexible = indexes.filter((index) => !fixed.includes(index));
        const fixedTotal = fixed.reduce((sum, index) => sum + explicit[index].durationMs, 0);
        const remaining = Math.max(0, target - fixedTotal);
        const weights = flexible.reduce((sum, index) => sum + textWeight(entries[index].text), 0) || flexible.length;
        flexible.forEach((index) => {
            explicit[index] = { durationMs: remaining ? Math.max(1, Math.round((remaining * textWeight(entries[index].text)) / weights)) : explicit[index].durationMs, source: "audio" };
        });
    };
    applyGroupDuration("dialogue", options.dialogueDurationMs);
    applyGroupDuration("narration", options.narrationDurationMs);

    if (options.totalDurationMs && options.totalDurationMs > 0) {
        const fixed = explicit.reduce((sum, item, index) => (cues.some((cue) => matchingCue([cue], entries[index], index) && cueDurationMs(cue)) ? sum + item.durationMs : sum), 0);
        const flexible = explicit.map((_, index) => index).filter((index) => !cues.some((cue) => matchingCue([cue], entries[index], index) && cueDurationMs(cue)));
        const remaining = Math.max(0, options.totalDurationMs - fixed);
        const weights = flexible.reduce((sum, index) => sum + textWeight(entries[index].text), 0) || flexible.length;
        flexible.forEach((index) => {
            explicit[index] = { durationMs: remaining ? Math.max(1, Math.round((remaining * textWeight(entries[index].text)) / weights)) : explicit[index].durationMs, source: "audio" };
        });
    }

    const min = options.minSegmentDurationMs || DEFAULT_MIN_SEGMENT_MS;
    const max = Math.max(min, options.maxSegmentDurationMs || DEFAULT_MAX_SEGMENT_MS);
    return explicit.map((item) => ({ ...item, durationMs: Math.max(min, Math.min(max, Math.round(item.durationMs))) }));
}

function estimateSpeechDurationMs(text: string, kind: DramaAudioSplitSegment["kind"]) {
    const cjk = text.match(/\p{Script=Han}/gu)?.length || 0;
    const words = text.replace(/\p{Script=Han}/gu, " ").match(/[\p{Letter}\p{Number}]+/gu)?.length || 0;
    const pauses = (text.match(/[，,、；;。！？!?]/gu)?.length || 0) * 120;
    const seconds = cjk / 4 + words / 2.5 + pauses / 1_000;
    const floor = kind === "narration" ? 6 : 5;
    const ceiling = kind === "narration" ? 12 : 10;
    return Math.round(Math.min(ceiling, Math.max(floor, seconds + (kind === "narration" ? 2 : 0))) * 1_000);
}

function textWeight(text: string) {
    const cjk = text.match(/\p{Script=Han}/gu)?.length || 0;
    const words = text.replace(/\p{Script=Han}/gu, " ").match(/[\p{Letter}\p{Number}]+/gu)?.length || 0;
    return Math.max(0.25, cjk / 4 + words / 2.5);
}

function utteranceOrder(utterance: DramaUtterance, fallback: number) {
    const value = Number(utterance.order);
    return Number.isFinite(value) && value > 0 ? value : fallback + 1;
}

function matchingCue(cues: DramaAudioSplitCue[], entry: SourceEntry, index: number) {
    return cues.find((cue) => {
        if (cue.utteranceId && entry.utterances.some((utterance) => utterance.id === cue.utteranceId)) return true;
        return cue.index === index;
    });
}

function cueDurationMs(cue: DramaAudioSplitCue | undefined) {
    if (!cue) return undefined;
    if (cue.durationMs && cue.durationMs > 0) return cue.durationMs;
    if (cue.startMs !== undefined && cue.endMs !== undefined && cue.endMs > cue.startMs) return cue.endMs - cue.startMs;
    return undefined;
}

function sourceDialogueSpeakers(shot: DramaShot) {
    return [...new Set(sourceEntries(shot).filter((entry) => entry.kind === "dialogue").map((entry) => entry.speaker.trim()).filter(Boolean))];
}

function splitSegmentVisualConstraint(segment: DramaAudioSplitSegment, allSpeakers: string[], source: DramaShot) {
    if (segment.kind === "narration") {
        const focus = allSpeakers.at(-1) || "画面人物";
        const action = `${focus}在画面中保持当前动作和表情，双唇闭合、无口型，仅呈现画外旁白。`;
        const result = `${focus}保持连续的视觉状态，不新增说话人物。`;
        return {
            action,
            result,
            videoPrompt: [source.location ? `场景：${source.location}` : "", source.time ? `时间：${source.time}` : "", action, `旁白：${segment.text}`, result, source.cameraMotion ? `运镜：${source.cameraMotion}` : "", `时长：${segment.duration}秒`]
                .filter(Boolean)
                .join("；"),
        };
    }
    const speaker = segment.speaker || "当前说话人";
    const others = allSpeakers.filter((name) => name !== speaker);
    const closed = others.length ? `${others.join("、")}闭口聆听、无口型` : "其他画面人物闭口聆听、无口型";
    const action = `镜头聚焦${speaker}，仅${speaker}开口并与台词同步口型，${closed}。`;
    const result = `${speaker}完成台词，保持既定情绪和动作连续性。`;
    return {
        action,
        result,
        videoPrompt: [source.location ? `场景：${source.location}` : "", source.time ? `时间：${source.time}` : "", action, `对白：${speaker}：${segment.text}`, result, source.cameraMotion ? `运镜：${source.cameraMotion}` : "", `时长：${segment.duration}秒`]
            .filter(Boolean)
            .join("；"),
    };
}

function assertAudioSplitSourceEligible(shot: DramaShot) {
    const value = shot as DramaShot & Record<string, unknown>;
    if (value.audioSplitSourceShotId) throw new DramaLabAudioSplitError("不能继续拆分已由音频候选生成的镜头", 409);
    if (value.userEdited === true || value.manuallyEdited === true) throw new DramaLabAudioSplitError("手工编辑的镜头不能按音频自动拆分", 409);
    const marker = [value.origin, value.creationSource, value.sourceType]
        .map((item) => cleanText(item).toLocaleLowerCase())
        .find(Boolean);
    if (marker && ["manual", "user", "user_created", "user-created", "manual_edit", "manual-edited"].includes(marker)) {
        throw new DramaLabAudioSplitError("手工创建的镜头不能按音频自动拆分", 409);
    }
}

function normalizeSubmittedSegment(value: unknown, index: number, expected: DramaAudioSplitSegment, options: DramaAudioSplitOptions): DramaAudioSplitSegment {
    const segment = asRecord(value);
    if (!segment) throw new DramaLabAudioSplitError(`第 ${index + 1} 个拆镜候选格式无效`, 400);
    if (Number(segment.index) !== index || segment.kind !== expected.kind) throw new DramaLabAudioSplitError(`第 ${index + 1} 个拆镜候选顺序或类型不一致`, 409);
    if (cleanText(segment.text) !== expected.text || cleanText(segment.speaker) !== (expected.speaker || "")) throw new DramaLabAudioSplitError(`第 ${index + 1} 个拆镜候选文本已变化，请重新预览`, 409);
    const submittedUtterances = Array.isArray(segment.utterances) ? segment.utterances : [];
    if (submittedUtterances.length !== expected.utterances.length || submittedUtterances.some((item, utteranceIndex) => asRecord(item)?.id !== expected.utterances[utteranceIndex].id || cleanText(asRecord(item)?.text) !== expected.utterances[utteranceIndex].text)) throw new DramaLabAudioSplitError(`第 ${index + 1} 个拆镜候选台词不一致`, 409);
    const durationMs = positiveNumber(segment.durationMs) || expected.durationMs;
    const min = options.minSegmentDurationMs || DEFAULT_MIN_SEGMENT_MS;
    const max = Math.max(min, options.maxSegmentDurationMs || DEFAULT_MAX_SEGMENT_MS);
    if (!Number.isFinite(durationMs) || durationMs < min || durationMs > max) throw new DramaLabAudioSplitError(`第 ${index + 1} 个拆镜候选时长超出允许范围`, 400);
    const suppliedId = cleanText(segment.candidateId);
    if (suppliedId && suppliedId !== expected.candidateId) throw new DramaLabAudioSplitError(`第 ${index + 1} 个拆镜候选 ID 无效`, 409);
    return {
        ...expected,
        durationMs: Math.round(durationMs),
        duration: Math.max(1, Math.round(durationMs / 1_000)),
        // Absolute timestamps and provenance are server-owned. The caller may
        // tune a clip duration, but cannot move a segment out of sequence or
        // relabel an estimated duration as measured audio.
        startMs: expected.startMs,
        endMs: expected.startMs + Math.round(durationMs),
        durationSource: expected.durationSource,
    };
}

function createSegmentShot(source: DramaShot, segment: DramaAudioSplitSegment, order: number, allSpeakers: string[]): DramaShot {
    const status: DramaTaskStatus = "idle";
    const titleSuffix = segment.kind === "narration" ? "旁白" : `${segment.speaker || "对白"}`;
    const constraint = splitSegmentVisualConstraint(segment, allSpeakers, source);
    const segmentText = segment.kind === "dialogue" && segment.speaker ? `${segment.speaker}：${segment.text}` : segment.text;
    const imagePrompt = [source.imagePrompt, constraint.action, segment.kind === "dialogue" ? `对白：${segmentText}` : `旁白：${segment.text}`].filter(Boolean).join("；");
    return {
        ...source,
        id: segment.candidateId,
        order,
        title: `${source.title} · ${titleSuffix}`,
        description: segmentText,
        shotBoundary: [source.shotBoundary, "按对白/旁白音频节奏拆分"].filter(Boolean).join("；"),
        sourceText: segment.text,
        dialogue: segment.kind === "dialogue" ? `${segment.speaker ? `${segment.speaker}：` : ""}${segment.text}` : "",
        narration: segment.kind === "narration" ? segment.text : "",
        subtitle: segment.text,
        utterances: segment.utterances,
        action: constraint.action,
        result: constraint.result,
        // Keep visual context and asset IDs, but force visual/audio generation
        // to start fresh for the new candidate.
        imagePrompt,
        videoPrompt: constraint.videoPrompt,
        // Frame prompts are derived from the source shot's action state.  A
        // split candidate has a different dialogue/narration beat, so keeping
        // the source values would make later first/last-frame generation use
        // stale actions.  The prompt compiler will derive fresh values from
        // this candidate's image/video prompts instead.
        startFramePrompt: undefined,
        endFramePrompt: undefined,
        polishedPrompt: undefined,
        universalSegmentText: undefined,
        segmentIndex: segment.index,
        duration: segment.duration,
        frames: undefined,
        firstFrameCandidate: undefined,
        videoFrameSnapshot: undefined,
        storyboardImageUrl: undefined,
        storyboardStatus: status,
        storyboardAttempt: undefined,
        storyboardTaskId: undefined,
        storyboardError: undefined,
        storyboardImageWidth: undefined,
        storyboardImageHeight: undefined,
        storyboardHistory: undefined,
        storyboardEndStatus: undefined,
        storyboardEndAttempt: undefined,
        storyboardEndTaskId: undefined,
        storyboardEndError: undefined,
        storyboardEndImageUrl: undefined,
        storyboardEndImageWidth: undefined,
        storyboardEndImageHeight: undefined,
        generationStatus: status,
        generationAttempt: undefined,
        generationTaskId: undefined,
        generationNeedsReview: undefined,
        generationError: undefined,
        videoUrl: undefined,
        videoHistory: undefined,
        dialogueAudio: undefined,
        narrationAudio: undefined,
        audioStatus: status,
        audioAttempt: undefined,
        audioTaskId: undefined,
        audioError: undefined,
        audioUrl: undefined,
        audioMode: "source",
        audioSplitSourceShotId: source.id,
        audioSplitSegmentIndex: segment.index,
    };
}

function findEpisode(project: DramaProject, episodeId: string) {
    const episode = project.episodes.find((item) => item.id === episodeId);
    if (!episode) throw new DramaLabAudioSplitError("短剧剧集不存在", 404);
    return episode;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function cleanText(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function positiveNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : undefined;
}

function nonNegativeNumber(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function nonNegativeInteger(value: unknown) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && Number.isInteger(number) ? number : undefined;
}
