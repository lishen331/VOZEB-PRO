/**
 * Resolve the audio files that are ready to be consumed by a drama render or
 * export operation.  New shots persist dialogue and narration independently;
 * older shots only have the legacy `audioUrl` field.
 */
export type DramaAudioTrackKind = "dialogue" | "narration" | "legacy";

export type DramaAudioTrack = {
    kind: DramaAudioTrackKind;
    url: string;
};

export type ResolvedDramaAudioTracks = {
    tracks: DramaAudioTrack[];
    dialogueUrl: string;
    narrationUrl: string;
    legacyUrl: string;
    /** Legacy root audio exists but cannot be assigned to one dedicated track. */
    needsReview?: true;
    reviewReason?: string;
};

/**
 * Return only completed per-kind tracks.  A URL on a running/error state is
 * deliberately ignored so a stale result cannot be rendered accidentally.
 * State objects from older data may omit `status`, in which case the URL is
 * still considered usable for backwards compatibility.
 */
export function resolveDramaAudioTracks(value: unknown): ResolvedDramaAudioTracks {
    const item = object(value);
    const dialogueUrl = readyAudioUrl(item.dialogueAudio) || stableUrl(item.dialogueAudioUrl);
    const narrationUrl = readyAudioUrl(item.narrationAudio) || stableUrl(item.narrationAudioUrl);
    const legacyUrl = stableUrl(item.audioUrl);
    const hasDedicatedState = present(item.dialogueAudio) || present(item.narrationAudio) || Boolean(text(item.dialogueAudioUrl) || text(item.narrationAudioUrl));
    const legacyKind = inferLegacyAudioKind(item);
    const tracks: DramaAudioTrack[] = [];
    if (dialogueUrl) tracks.push({ kind: "dialogue", url: dialogueUrl });
    if (narrationUrl) tracks.push({ kind: "narration", url: narrationUrl });
    // `audioUrl` is a projection of the latest requested track in legacy
    // persistence. Keep it when its owner is unambiguous and the dedicated
    // state for that owner is still missing. Otherwise retain the old generic
    // track only when no dedicated state exists at all.
    if (legacyUrl) {
        const ownerPresent = legacyKind === "dialogue" ? Boolean(dialogueUrl) : legacyKind === "narration" ? Boolean(narrationUrl) : false;
        const alreadyPresent = tracks.some((track) => track.url === legacyUrl);
        if (hasDedicatedState && legacyKind === "dialogue" && !ownerPresent && !alreadyPresent) tracks.push({ kind: "dialogue", url: legacyUrl });
        else if (hasDedicatedState && legacyKind === "narration" && !ownerPresent && !alreadyPresent) tracks.push({ kind: "narration", url: legacyUrl });
        else if (!hasDedicatedState && !tracks.length) tracks.push({ kind: "legacy", url: legacyUrl });
    }
    // Do not guess which dedicated track owns a legacy URL when both kinds of
    // text are present. Surface an explicit review state instead of silently
    // hiding the media from render/export.
    const dedicatedTrackMatchesLegacy = tracks.some((track) => track.kind !== "legacy" && track.url === legacyUrl);
    const ambiguousLegacyOwner = Boolean(legacyUrl && !legacyKind && hasBothAudioTextKinds(item) && !dedicatedTrackMatchesLegacy);
    return ambiguousLegacyOwner ? { tracks, dialogueUrl, narrationUrl, legacyUrl, needsReview: true, reviewReason: "旧音频同时存在对白和旁白文本，无法确定归属" } : { tracks, dialogueUrl, narrationUrl, legacyUrl };
}

function hasBothAudioTextKinds(item: Record<string, unknown>) {
    const utterances = Array.isArray(item.utterances) ? item.utterances : [];
    const hasDialogue = Boolean(
        text(item.dialogue) ||
        text(item.subtitle) ||
        utterances.some((entry) => {
            const value = object(entry);
            return value.type === "dialogue" && text(value.text);
        }),
    );
    const hasNarration = Boolean(
        text(item.narration) ||
        utterances.some((entry) => {
            const value = object(entry);
            return value.type === "voiceover" && text(value.text);
        }),
    );
    return hasDialogue && hasNarration;
}

function inferLegacyAudioKind(item: Record<string, unknown>): "dialogue" | "narration" | undefined {
    const utterances = Array.isArray(item.utterances) ? item.utterances : [];
    const hasDialogue = Boolean(
        text(item.dialogue) ||
        text(item.subtitle) ||
        utterances.some((entry) => {
            const value = object(entry);
            return value.type === "dialogue" && text(value.text);
        }),
    );
    const hasNarration = Boolean(
        text(item.narration) ||
        utterances.some((entry) => {
            const value = object(entry);
            return value.type === "voiceover" && text(value.text);
        }),
    );
    if (hasDialogue && !hasNarration) return "dialogue";
    if (hasNarration && !hasDialogue) return "narration";
    return undefined;
}

function readyAudioUrl(value: unknown) {
    if (typeof value === "string") return stableUrl(value);
    const state = object(value);
    const url = stableUrl(state.url);
    if (!url) return "";
    return state.status === undefined || state.status === "success" ? url : "";
}

function present(value: unknown) {
    if (typeof value === "string") return Boolean(value.trim());
    return Boolean(value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length);
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function stableUrl(value: unknown) {
    const url = text(value);
    return url && !url.startsWith("data:") && !url.startsWith("blob:") ? url : "";
}

function object(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
