import { normalizeDramaShotAudioMode } from "@/lib/server/drama-render-audio";
import { resolveDramaShotDuration } from "@/lib/server/drama-shot-config";
import { resolveDramaAudioTracks, type DramaAudioTrack } from "@/lib/server/drama-audio-tracks";

export type NormalizedDramaRenderShot = {
    videoUrl: string;
    audioMode: ReturnType<typeof normalizeDramaShotAudioMode>;
    audioUrl: string;
    /** Ready dialogue/narration files, retained separately for mixing. */
    audioTracks: DramaAudioTrack[];
    dialogueAudioUrl: string;
    narrationAudioUrl: string;
    subtitle: string;
    duration: number;
};

export type NormalizeDramaRenderShotsOptions = {
    /**
     * Dedicated dialogue/narration tracks are a short-drama-lab concern. The
     * legacy /drama renderer must honor the caller's explicit audioMode even
     * when a shared shot payload happens to contain those fields.
     */
    preferDedicatedAudio?: boolean;
};

export function normalizeDramaRenderShots(value: unknown, options: NormalizeDramaRenderShotsOptions = {}): NormalizedDramaRenderShot[] {
    const preferDedicatedAudio = options.preferDedicatedAudio ?? true;
    return array(value).map((shot) => {
        const item = object(shot);
        const audio = resolveDramaAudioTracks(item);
        const requestedMode = normalizeDramaShotAudioMode(item.audioMode);
        // A dedicated TTS result is authoritative unless the user explicitly
        // muted the shot.  This also makes payloads that omit audioMode render
        // their newly generated track instead of silently falling back to the
        // source video's audio.
        const hasDedicatedAudio = Boolean(audio.dialogueUrl || audio.narrationUrl);
        const audioMode = requestedMode === "mute" ? "mute" : preferDedicatedAudio && hasDedicatedAudio ? "voiceover" : requestedMode;
        return {
            videoUrl: text(item.videoUrl),
            audioMode,
            audioUrl: audio.tracks[0]?.url || "",
            audioTracks: audio.tracks,
            dialogueAudioUrl: audio.dialogueUrl,
            narrationAudioUrl: audio.narrationUrl,
            subtitle: text(item.subtitle) || text(item.dialogue) || text(item.narration),
            duration: resolveDramaShotDuration(item.duration, 5),
        };
    });
}

function text(value: unknown) {
    return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown) {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function array(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}
