import { createHash } from "node:crypto";

import { parseDialogScript } from "@/lib/server/audio-dialog-service";

export function resolveAudioTaskOptions(config: { voice?: unknown; format?: unknown; speed?: unknown } | undefined, defaults: { audioVoice: string; audioFormat: string }) {
    return {
        voice: clean(config?.voice, 80) || defaults.audioVoice,
        format: clean(config?.format, 16) || defaults.audioFormat,
        speed: clean(config?.speed, 16) || "1",
    };
}

export type AudioMode = "tts" | "design" | "clone" | "dialog";

/** 生成模式相关的任务字段：只接受三种已知模式，其他一律按普通合成。 */
export function resolveAudioModeOptions(
    config: { mode?: unknown; voiceDescription?: unknown; referenceAudioUrl?: unknown; referenceAudioDurationMs?: unknown; cloneConsent?: unknown; dialogText?: unknown; dialogRoles?: unknown } | undefined,
    context: { channelId: string; model: string; userId: string },
) {
    const mode: AudioMode = config?.mode === "design" || config?.mode === "clone" || config?.mode === "dialog" ? config.mode : "tts";
    if (mode === "tts") return { mode } as const;
    if (mode === "dialog") return { mode, dialog: resolveDialogScript(config) } as const;
    if (mode === "design") {
        return { mode, voiceDescription: clean(config?.voiceDescription, 500) } as const;
    }
    const referenceAudioUrl = clean(config?.referenceAudioUrl, 2000);
    return {
        mode,
        referenceAudioUrl,
        referenceAudioDurationMs: typeof config?.referenceAudioDurationMs === "number" && Number.isFinite(config.referenceAudioDurationMs) ? config.referenceAudioDurationMs : undefined,
        cloneConsent: config?.cloneConsent === true,
        ...(referenceAudioUrl ? { referenceAudioFingerprint: cloneFingerprint(context, referenceAudioUrl) } : {}),
    } as const;
}

/** 多人对话：解析文本得到台词，角色音色从请求里带过来，只保留实际出现的角色。 */
export function resolveDialogScript(config: { dialogText?: unknown; dialogRoles?: unknown } | undefined) {
    const text = typeof config?.dialogText === "string" ? config.dialogText.slice(0, 200_000) : "";
    const lines = parseDialogScript(text);
    const names = new Set(lines.map((line) => line.role));
    const rawRoles = config?.dialogRoles && typeof config.dialogRoles === "object" && !Array.isArray(config.dialogRoles) ? (config.dialogRoles as Record<string, unknown>) : {};
    const roles = Object.fromEntries(
        [...names].flatMap((name) => {
            const role = rawRoles[name];
            if (!role || typeof role !== "object" || Array.isArray(role)) return [];
            const record = role as Record<string, unknown>;
            const voice = typeof record.voice === "string" ? record.voice.trim().slice(0, 200) : "";
            if (!voice) return [];
            const instruction = typeof record.instruction === "string" ? record.instruction.trim().slice(0, 200) : "";
            const emotion = typeof record.emotion === "string" ? record.emotion.trim().slice(0, 32) : "";
            return [[name, { voice, ...(instruction ? { instruction } : {}), ...(emotion ? { emotion } : {}) }] as const];
        }),
    );
    return { lines, roles };
}

/** 同一段参考音频在同一个渠道、同一个合成模型下只克隆一次。 */
export function cloneFingerprint(context: { channelId: string; model: string; userId: string }, referenceAudioUrl: string) {
    return createHash("sha256").update(`${context.userId}|${context.channelId}|${context.model}|${referenceAudioUrl}`).digest("hex");
}

function clean(value: unknown, max: number) {
    return typeof value === "string" ? value.trim().slice(0, max) : "";
}
