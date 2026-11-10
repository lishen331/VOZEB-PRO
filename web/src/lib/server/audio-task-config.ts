import { createHash } from "node:crypto";

export function resolveAudioTaskOptions(config: { voice?: unknown; format?: unknown; speed?: unknown } | undefined, defaults: { audioVoice: string; audioFormat: string }) {
    return {
        voice: clean(config?.voice, 80) || defaults.audioVoice,
        format: clean(config?.format, 16) || defaults.audioFormat,
        speed: clean(config?.speed, 16) || "1",
    };
}

export type AudioMode = "tts" | "design" | "clone";

/** 生成模式相关的任务字段：只接受三种已知模式，其他一律按普通合成。 */
export function resolveAudioModeOptions(config: { mode?: unknown; voiceDescription?: unknown; referenceAudioUrl?: unknown; cloneConsent?: unknown } | undefined, context: { channelId: string; model: string; userId: string }) {
    const mode: AudioMode = config?.mode === "design" || config?.mode === "clone" ? config.mode : "tts";
    if (mode === "tts") return { mode } as const;
    if (mode === "design") {
        return { mode, voiceDescription: clean(config?.voiceDescription, 500) } as const;
    }
    const referenceAudioUrl = clean(config?.referenceAudioUrl, 2000);
    return {
        mode,
        referenceAudioUrl,
        cloneConsent: config?.cloneConsent === true,
        ...(referenceAudioUrl ? { referenceAudioFingerprint: cloneFingerprint(context, referenceAudioUrl) } : {}),
    } as const;
}

/** 同一段参考音频在同一个渠道、同一个合成模型下只克隆一次。 */
export function cloneFingerprint(context: { channelId: string; model: string; userId: string }, referenceAudioUrl: string) {
    return createHash("sha256").update(`${context.userId}|${context.channelId}|${context.model}|${referenceAudioUrl}`).digest("hex");
}

function clean(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
