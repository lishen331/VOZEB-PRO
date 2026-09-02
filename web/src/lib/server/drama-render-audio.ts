import type { DramaShotAudioMode } from "@/lib/drama-project-contract";

export type DramaRenderAudioPlan = "source" | "voiceover" | "silence";

/**
 * All intermediate render clips use one audio stream contract so the final
 * concat demuxer can safely use stream copy.  Inputs from TTS providers and
 * generated videos commonly disagree on sample rate/channel layout.
 */
export const DRAMA_RENDER_AUDIO_SAMPLE_RATE = 44_100;
export const DRAMA_RENDER_AUDIO_CHANNEL_LAYOUT = "stereo";

export function buildDramaRenderAudioFilter(inputCount: number, duration: number) {
    if (!Number.isInteger(inputCount) || inputCount < 1) throw new RangeError("至少需要一条音频输入");
    if (!Number.isFinite(duration) || duration <= 0) throw new RangeError("音频时长无效");
    const normalizedInputs = Array.from({ length: inputCount }, (_, index) => `[${index + 1}:a]aformat=sample_rates=${DRAMA_RENDER_AUDIO_SAMPLE_RATE}:channel_layouts=${DRAMA_RENDER_AUDIO_CHANNEL_LAYOUT}[audio${index}]`).join(";");
    const normalizedLabels = Array.from({ length: inputCount }, (_, index) => `[audio${index}]`).join("");
    const tail = inputCount === 1 ? `${normalizedLabels}apad,atrim=0:${duration}` : `${normalizedLabels}amix=inputs=${inputCount}:duration=longest:dropout_transition=0,apad,atrim=0:${duration}`;
    return `${normalizedInputs};${tail},aformat=sample_rates=${DRAMA_RENDER_AUDIO_SAMPLE_RATE}:channel_layouts=${DRAMA_RENDER_AUDIO_CHANNEL_LAYOUT}[a]`;
}

export function normalizeDramaShotAudioMode(value: unknown): DramaShotAudioMode {
    return value === "voiceover" || value === "mute" ? value : "source";
}

export function resolveDramaRenderAudioPlan(audioMode: DramaShotAudioMode, audioUrl: string, sourceHasAudio: boolean): DramaRenderAudioPlan {
    if (audioMode === "voiceover") {
        if (!audioUrl) throw new Error("AI 配音尚未完成");
        return "voiceover";
    }
    if (audioMode === "source" && sourceHasAudio) return "source";
    return "silence";
}
