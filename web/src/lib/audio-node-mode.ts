import { detectDialogScript } from "@/lib/audio-dialog-script";

/*
 * 音频节点生成模式的判定与请求组装。普通画布和短剧画布共用，保证界面提示和实际提交一致。
 *
 * 自动切换规则（spec §3.2）：
 * - 用户手动选过模式：一律以用户选择为准。
 * - 有音频节点连进来：默认「克隆」。
 * - 否则：默认「合成」。多人对话只在用户确认后才切换，这里不自动切。
 */

export type AudioMode = "tts" | "design" | "clone" | "dialog";

/** 克隆参考音频的时长窗口：下界两家一致；上界取两家公开限制的较宽值，精确值仍由渠道配置在服务端校验。 */
export const CLONE_AUDIO_LIMITS = { minSec: 10, maxSec: 300 };

export type AudioModeNodeState = {
    audioMode?: AudioMode;
    audioModeManual?: boolean;
    audioVoiceDescription?: string;
    audioCloneConsent?: boolean;
    audioDialogRoles?: Record<string, { voice: string; instruction?: string; emotion?: string }>;
    audioDialogSuggestDismissed?: boolean;
};

export function resolveAudioMode(state: AudioModeNodeState, hasReferenceAudio: boolean): AudioMode {
    if (state.audioModeManual && state.audioMode) return state.audioMode;
    if (hasReferenceAudio) return "clone";
    return state.audioMode && state.audioMode !== "clone" ? state.audioMode : "tts";
}

/** 输入框上方是否提示「检测到多个角色，要切到多人对话吗？」 */
export function shouldSuggestDialog(state: AudioModeNodeState, mode: AudioMode, text: string) {
    if (mode === "dialog" || state.audioDialogSuggestDismissed) return null;
    const detected = detectDialogScript(text);
    return detected.suggested ? detected.roles : null;
}

/** 提交前的阻断原因；返回 null 表示可以生成。 */
export function audioModeBlockingReason(mode: AudioMode, state: AudioModeNodeState, input: { text: string; referenceAudioUrl?: string; referenceAudioDurationMs?: number }) {
    if (mode === "design" && !state.audioVoiceDescription?.trim()) return "请先填写声音描述";
    if (mode === "clone" && !input.referenceAudioUrl) return "克隆需要参考音频：把一个音频节点连到本节点";
    if (mode === "clone" && !state.audioCloneConsent) return "请先勾选「我已获得该声音本人授权」";
    if (mode === "clone" && input.referenceAudioDurationMs !== undefined && input.referenceAudioDurationMs > 0) {
        const seconds = Math.round(input.referenceAudioDurationMs / 1000);
        if (seconds < CLONE_AUDIO_LIMITS.minSec || seconds > CLONE_AUDIO_LIMITS.maxSec) return `参考音频 ${seconds} 秒，需要 ${CLONE_AUDIO_LIMITS.minSec}–${CLONE_AUDIO_LIMITS.maxSec} 秒`;
    }
    if (mode === "dialog") {
        const { roles } = detectDialogScript(input.text);
        if (roles.length < 2) return "多人对话至少要 2 个角色，每行写成「名字：台词」";
        const missing = roles.find((role) => !state.audioDialogRoles?.[role]?.voice?.trim());
        if (missing) return `角色「${missing}」还没有选择音色`;
    }
    return null;
}

/** 组装 /api/audio-tasks 需要的模式字段。 */
export function buildAudioModeRequest(mode: AudioMode, state: AudioModeNodeState, input: { text: string; referenceAudioUrl?: string }) {
    if (mode === "design") return { mode, voiceDescription: (state.audioVoiceDescription || "").trim() } as const;
    if (mode === "clone") return { mode, referenceAudioUrl: input.referenceAudioUrl || "", cloneConsent: Boolean(state.audioCloneConsent) } as const;
    if (mode === "dialog") {
        const { roles } = detectDialogScript(input.text);
        const dialogRoles = Object.fromEntries(roles.flatMap((role) => (state.audioDialogRoles?.[role] ? [[role, state.audioDialogRoles[role]]] : [])));
        return { mode, dialogText: input.text, dialogRoles } as const;
    }
    return { mode: "tts" } as const;
}

/** 克隆请求带上参考音频时长，服务端在调用上游前按渠道限制校验。 */
export function withAudioDuration(request: ReturnType<typeof buildAudioModeRequest>, durationMs?: number) {
    return request.mode === "clone" && durationMs !== undefined ? { ...request, referenceAudioDurationMs: durationMs } : request;
}
