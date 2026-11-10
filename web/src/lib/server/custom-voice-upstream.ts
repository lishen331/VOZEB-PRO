import { fetchSafeOutbound } from "./safe-outbound-fetch";
import type { SystemModelChannel } from "@/lib/auth/store";
import type { VoiceCustomizationConfig, CustomVoiceStatus } from "@/lib/custom-voice-config";

/*
 * 自定义音色上游适配器。请求格式以官方文档为准：
 * - 千问（百炼）：克隆、设计、查询、删除共用 POST /api/v1/services/audio/tts/customization，
 *   model 固定 "voice-enrollment"，用 input.action 区分操作（create_voice / query_voice / delete_voice）。
 *   https://docs.bailian.console.aliyun.com/zh/model-studio/voice-clone-design-http-api
 *   https://docs.bailian.console.aliyun.com/zh/model-studio/voice-design-api-references
 *   音色创建时用 target_model 绑定合成模型，之后合成必须用同一模型。
 * - MiniMax 官方：克隆 = /files/upload + /voice_clone；设计 = /voice_design（voice_id 由上游生成）。
 *   渠道 baseUrl 已含 /v1，这里的兜底路径不再带 /v1。
 */

export const QWEN_VOICE_ENROLLMENT_MODEL = "voice-enrollment";
const QWEN_CUSTOMIZATION_PATH = "/api/v1/services/audio/tts/customization";

type MinimaxFileUploadResponse = {
    file?: { file_id?: string | number };
    base_resp?: { status_code?: number; status_msg?: string };
};

type MinimaxVoiceResponse = {
    voice_id?: string;
    trial_audio?: string;
    demo_audio?: string;
    base_resp?: { status_code?: number; status_msg?: string };
};

type QwenCustomizationResponse = {
    output?: {
        voice_id?: string;
        status?: string;
        target_model?: string;
        preview_audio?: { data?: string; response_format?: string };
    };
    code?: string;
    message?: string;
    request_id?: string;
};

export type CustomVoiceUpstreamResult = {
    status: CustomVoiceStatus;
    upstreamVoiceId?: string;
    upstreamRequestId?: string;
    previewUrl?: string;
    previewMimeType?: string;
    /** 设计接口返回的试听音频（Base64），调用方负责落库后换成 previewUrl。 */
    previewAudioBase64?: string;
    failureReason?: string;
};

export type ReferenceAudioInput = { url: string } | { data: Buffer; format: string };

/** 上游音色名前缀：千问只允许字母和数字、最多 10 位。 */
export function upstreamVoicePrefix(seed: string) {
    const cleaned = seed.replace(/[^A-Za-z0-9]/g, "").slice(0, 8);
    return `vz${cleaned || "voice"}`.slice(0, 10);
}

// ---------------------------------------------------------------- 千问

export function qwenCloneRequest(targetModel: string, prefix: string, audio: ReferenceAudioInput) {
    return {
        model: QWEN_VOICE_ENROLLMENT_MODEL,
        input: {
            action: "create_voice",
            target_model: targetModel,
            audio: "url" in audio ? audio.url : `data:${audioMimeType(audio.format)};base64,${audio.data.toString("base64")}`,
            prefix,
            language_hints: ["zh"],
        },
    };
}

export function qwenDesignRequest(targetModel: string, prefix: string, voicePrompt: string, previewText: string) {
    return {
        model: QWEN_VOICE_ENROLLMENT_MODEL,
        input: {
            action: "create_voice",
            target_model: targetModel,
            voice_prompt: voicePrompt,
            preview_text: previewText,
            prefix,
            language_hints: ["zh"],
        },
        parameters: { response_format: "mp3" },
    };
}

export function qwenQueryRequest(voiceId: string) {
    return { model: QWEN_VOICE_ENROLLMENT_MODEL, input: { action: "query_voice", voice_id: voiceId } };
}

export function qwenDeleteRequest(voiceId: string) {
    return { model: QWEN_VOICE_ENROLLMENT_MODEL, input: { action: "delete_voice", voice_id: voiceId } };
}

export async function submitQwenVoiceClone(channel: SystemModelChannel, config: VoiceCustomizationConfig, targetModel: string, prefix: string, audio: ReferenceAudioInput): Promise<CustomVoiceUpstreamResult> {
    const result = await postQwen(channel, config, qwenCloneRequest(targetModel, prefix, audio), "音色克隆");
    if ("failureReason" in result) return result;
    const voiceId = result.output?.voice_id;
    if (!voiceId) return { status: "failed", failureReason: "音色克隆返回无效：缺少 voice_id" };
    // 克隆音色需要审核：创建即返回 voice_id，状态通过 query_voice 轮询，OK 后才可用。
    return { status: qwenStatus(result.output?.status) ?? "creating", upstreamVoiceId: voiceId, upstreamRequestId: result.request_id };
}

export async function submitQwenVoiceDesign(channel: SystemModelChannel, config: VoiceCustomizationConfig, targetModel: string, prefix: string, voicePrompt: string, previewText: string): Promise<CustomVoiceUpstreamResult> {
    const result = await postQwen(channel, config, qwenDesignRequest(targetModel, prefix, voicePrompt, previewText), "音色设计");
    if ("failureReason" in result) return result;
    const voiceId = result.output?.voice_id;
    if (!voiceId) return { status: "failed", failureReason: "音色设计返回无效：缺少 voice_id" };
    const format = result.output?.preview_audio?.response_format || "mp3";
    return {
        status: qwenStatus(result.output?.status) ?? "ready",
        upstreamVoiceId: voiceId,
        upstreamRequestId: result.request_id,
        previewAudioBase64: result.output?.preview_audio?.data,
        previewMimeType: result.output?.preview_audio?.data ? audioMimeType(format) : undefined,
    };
}

export async function queryQwenVoiceStatus(channel: SystemModelChannel, upstreamVoiceId: string): Promise<CustomVoiceUpstreamResult> {
    const result = await postQwen(channel, channel.advancedConfig?.voiceCustomization, qwenQueryRequest(upstreamVoiceId), "查询音色状态");
    if ("failureReason" in result) return result;
    const status = qwenStatus(result.output?.status);
    if (status === "failed") return { status: "failed", upstreamVoiceId, failureReason: "音色审核未通过" };
    return { status: status ?? "creating", upstreamVoiceId, upstreamRequestId: result.request_id };
}

export async function deleteQwenVoice(channel: SystemModelChannel, config: VoiceCustomizationConfig, upstreamVoiceId: string): Promise<{ success: boolean; error?: string }> {
    const result = await postQwen(channel, config, qwenDeleteRequest(upstreamVoiceId), "删除音色");
    return "failureReason" in result ? { success: false, error: result.failureReason } : { success: true };
}

/** DEPLOYING → creating，OK → ready，UNDEPLOYED → failed；未知状态返回 undefined 由调用方决定。 */
export function qwenStatus(value: string | undefined): CustomVoiceStatus | undefined {
    const status = (value || "").toUpperCase();
    if (status === "OK") return "ready";
    if (status === "DEPLOYING") return "creating";
    if (status === "UNDEPLOYED") return "failed";
    return undefined;
}

async function postQwen(channel: SystemModelChannel, config: VoiceCustomizationConfig | undefined, body: unknown, label: string): Promise<QwenCustomizationResponse | { status: "failed"; failureReason: string }> {
    try {
        const path = config?.paths.customization || QWEN_CUSTOMIZATION_PATH;
        const response = await fetchSafeOutbound(joinUrl(channel.baseUrl, path), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.apiKey}` },
            body: JSON.stringify(body),
        });
        const text = await response.text();
        const data = parseJson<QwenCustomizationResponse>(text);
        if (!response.ok || (data?.code && data.code !== "Success")) {
            return { status: "failed", failureReason: `${label}失败：${data?.message || text.slice(0, 300) || `HTTP ${response.status}`}` };
        }
        return data || {};
    } catch (error) {
        return { status: "failed", failureReason: error instanceof Error ? `${label}请求异常：${error.message}` : `${label}请求异常` };
    }
}

// ---------------------------------------------------------------- MiniMax

export async function submitMinimaxVoiceClone(channel: SystemModelChannel, config: VoiceCustomizationConfig, voiceId: string, audio: { data: Buffer; format: string }): Promise<CustomVoiceUpstreamResult> {
    try {
        const formData = new FormData();
        formData.append("file", new Blob([new Uint8Array(audio.data)], { type: audioMimeType(audio.format) }), `voice.${audio.format}`);
        formData.append("purpose", "voice_clone");
        const uploadResponse = await fetchSafeOutbound(joinUrl(channel.baseUrl, config.paths.upload || "/files/upload"), {
            method: "POST",
            headers: { Authorization: `Bearer ${channel.apiKey}` },
            body: formData,
        });
        const uploadText = await uploadResponse.text();
        const upload = parseJson<MinimaxFileUploadResponse>(uploadText);
        if (!uploadResponse.ok || minimaxError(upload)) return { status: "failed", failureReason: `音频上传失败：${minimaxError(upload) || uploadText.slice(0, 300)}` };
        const fileId = upload?.file?.file_id;
        if (!fileId) return { status: "failed", failureReason: "音频上传返回无效：缺少 file_id" };

        const cloneResponse = await fetchSafeOutbound(joinUrl(channel.baseUrl, config.paths.clone || "/voice_clone"), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.apiKey}` },
            body: JSON.stringify({ file_id: Number(fileId) || fileId, voice_id: voiceId }),
        });
        const cloneText = await cloneResponse.text();
        const clone = parseJson<MinimaxVoiceResponse>(cloneText);
        if (!cloneResponse.ok || minimaxError(clone)) return { status: "failed", failureReason: `音色克隆失败：${minimaxError(clone) || cloneText.slice(0, 300)}` };
        // MiniMax 克隆用的是我们指定的 voice_id，成功即可用。
        return { status: "ready", upstreamVoiceId: clone?.voice_id || voiceId, previewUrl: clone?.demo_audio || undefined, previewMimeType: clone?.demo_audio ? "audio/mpeg" : undefined };
    } catch (error) {
        return { status: "failed", failureReason: error instanceof Error ? `音色克隆请求异常：${error.message}` : "音色克隆请求异常" };
    }
}

export async function submitMinimaxVoiceDesign(channel: SystemModelChannel, config: VoiceCustomizationConfig, description: string, previewText: string): Promise<CustomVoiceUpstreamResult> {
    try {
        const response = await fetchSafeOutbound(joinUrl(channel.baseUrl, config.paths.design || "/voice_design"), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.apiKey}` },
            body: JSON.stringify({ prompt: description, preview_text: previewText }),
        });
        const text = await response.text();
        const data = parseJson<MinimaxVoiceResponse>(text);
        if (!response.ok || minimaxError(data)) return { status: "failed", failureReason: `音色设计失败：${minimaxError(data) || text.slice(0, 300)}` };
        if (!data?.voice_id) return { status: "failed", failureReason: "音色设计返回无效：缺少 voice_id" };
        // trial_audio 是 hex 编码的试听音频，换成 Base64 交给调用方落库。
        const previewAudioBase64 = data.trial_audio ? Buffer.from(data.trial_audio, "hex").toString("base64") : undefined;
        return { status: "ready", upstreamVoiceId: data.voice_id, previewAudioBase64, previewMimeType: previewAudioBase64 ? "audio/mpeg" : undefined };
    } catch (error) {
        return { status: "failed", failureReason: error instanceof Error ? `音色设计请求异常：${error.message}` : "音色设计请求异常" };
    }
}

export async function deleteMinimaxVoice(channel: SystemModelChannel, config: VoiceCustomizationConfig, upstreamVoiceId: string, kind: "clone" | "design"): Promise<{ success: boolean; error?: string }> {
    try {
        const response = await fetchSafeOutbound(joinUrl(channel.baseUrl, config.paths.delete || "/delete_voice"), {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.apiKey}` },
            body: JSON.stringify({ voice_type: kind === "clone" ? "voice_cloning" : "voice_generation", voice_id: upstreamVoiceId }),
        });
        const text = await response.text();
        const data = parseJson<MinimaxVoiceResponse>(text);
        if (!response.ok || minimaxError(data)) return { success: false, error: `删除音色失败：${minimaxError(data) || text.slice(0, 300)}` };
        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? `删除音色请求异常：${error.message}` : "删除音色请求异常" };
    }
}

function minimaxError(data: { base_resp?: { status_code?: number; status_msg?: string } } | undefined) {
    const code = data?.base_resp?.status_code;
    return code !== undefined && code !== 0 ? data?.base_resp?.status_msg || `错误码 ${code}` : "";
}

// ---------------------------------------------------------------- 共用

export function joinUrl(baseUrl: string, path: string) {
    return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

export function audioMimeType(format: string) {
    const value = format.toLowerCase();
    if (value === "wav") return "audio/wav";
    if (value === "m4a" || value === "mp4") return "audio/mp4";
    if (value === "pcm") return "audio/pcm";
    return "audio/mpeg";
}

function parseJson<T>(text: string): T | undefined {
    try {
        return JSON.parse(text) as T;
    } catch {
        return undefined;
    }
}
