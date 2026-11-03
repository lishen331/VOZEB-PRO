import { fetchSafeOutbound } from "./safe-outbound-fetch";
import type { SystemModelChannel } from "@/lib/auth/store";
import type { VoiceCustomizationConfig, CustomVoiceStatus } from "@/lib/custom-voice-config";

type MinimaxFileUploadResponse = {
    file: { file_id: string };
};

type MinimaxVoiceResponse = {
    voice_id: string;
    status?: string;
    audio_url?: string;
    extra_info?: { audio: { sample_audio: string } };
    message?: string;
    base_resp?: { status_code?: number; status_msg?: string };
};

type QwenVoiceCustomizationResponse = {
    output?: { voice: string; audio?: string };
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
    failureReason?: string;
};

export async function submitMinimaxVoiceClone(channel: SystemModelChannel, config: VoiceCustomizationConfig, voiceId: string, name: string, audioBuffer: Buffer, audioFormat: string): Promise<CustomVoiceUpstreamResult> {
    try {
        const uploadPath = config.paths.upload || "/v1/files/upload";
        const clonePath = config.paths.clone || "/v1/voice_clone";

        const formData = new FormData();
        const blob = new Blob([new Uint8Array(audioBuffer)], { type: `audio/${audioFormat}` });
        formData.append("file", blob, `voice.${audioFormat}`);
        formData.append("purpose", "voice_clone");

        const uploadResponse = await fetchSafeOutbound(`${channel.baseUrl}${uploadPath}`, {
            method: "POST",
            headers: { Authorization: `Bearer ${channel.apiKey}` },
            body: formData,
        });

        if (!uploadResponse.ok) {
            const error = await uploadResponse.text();
            return { status: "failed", failureReason: `音频上传失败: ${error}` };
        }

        const uploadData = (await uploadResponse.json()) as MinimaxFileUploadResponse;
        const fileId = uploadData.file?.file_id;
        if (!fileId) return { status: "failed", failureReason: "音频上传返回无效" };

        const cloneRequest = { file_id: fileId, voice_id: voiceId };
        const cloneResponse = await fetchSafeOutbound(`${channel.baseUrl}${clonePath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.apiKey}` },
            body: JSON.stringify(cloneRequest),
        });

        if (!cloneResponse.ok) {
            const error = await cloneResponse.text();
            return { status: "failed", failureReason: `音色克隆失败: ${error}` };
        }

        const cloneData = (await cloneResponse.json()) as MinimaxVoiceResponse;
        if (cloneData.base_resp?.status_code && cloneData.base_resp.status_code !== 0) {
            return { status: "failed", failureReason: cloneData.base_resp.status_msg || "音色克隆失败" };
        }
        if (!cloneData.voice_id) return { status: "failed", failureReason: "音色克隆返回无效" };

        const previewUrl = cloneData.audio_url || cloneData.extra_info?.audio?.sample_audio;
        return { status: "ready", upstreamVoiceId: cloneData.voice_id, previewUrl, previewMimeType: previewUrl ? "audio/mpeg" : undefined };
    } catch (error) {
        return { status: "failed", failureReason: error instanceof Error ? error.message : "音色克隆请求异常" };
    }
}

export async function submitMinimaxVoiceDesign(channel: SystemModelChannel, config: VoiceCustomizationConfig, voiceId: string, name: string, description: string, previewText?: string): Promise<CustomVoiceUpstreamResult> {
    try {
        const designPath = config.paths.design || "/v1/voice_design";
        const designRequest = { voice_id: voiceId, description, ...(previewText ? { preview_text: previewText } : {}) };

        const designResponse = await fetchSafeOutbound(`${channel.baseUrl}${designPath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.apiKey}` },
            body: JSON.stringify(designRequest),
        });

        if (!designResponse.ok) {
            const error = await designResponse.text();
            return { status: "failed", failureReason: `音色设计失败: ${error}` };
        }

        const designData = (await designResponse.json()) as MinimaxVoiceResponse;
        if (designData.base_resp?.status_code && designData.base_resp.status_code !== 0) {
            return { status: "failed", failureReason: designData.base_resp.status_msg || "音色设计失败" };
        }
        if (!designData.voice_id) return { status: "failed", failureReason: "音色设计返回无效" };

        const previewUrl = designData.audio_url || designData.extra_info?.audio?.sample_audio;
        return { status: "ready", upstreamVoiceId: designData.voice_id, previewUrl, previewMimeType: previewUrl ? "audio/mpeg" : undefined };
    } catch (error) {
        return { status: "failed", failureReason: error instanceof Error ? error.message : "音色设计请求异常" };
    }
}

export async function deleteMinimaxVoice(channel: SystemModelChannel, config: VoiceCustomizationConfig, upstreamVoiceId: string): Promise<{ success: boolean; error?: string }> {
    try {
        const deletePath = config.paths.delete || "/v1/delete_voice";
        const deleteRequest = { voice_id: upstreamVoiceId };

        const deleteResponse = await fetchSafeOutbound(`${channel.baseUrl}${deletePath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.apiKey}` },
            body: JSON.stringify(deleteRequest),
        });

        if (!deleteResponse.ok) {
            const error = await deleteResponse.text();
            return { success: false, error: `删除音色失败: ${error}` };
        }

        const deleteData = (await deleteResponse.json()) as MinimaxVoiceResponse;
        if (deleteData.base_resp?.status_code && deleteData.base_resp.status_code !== 0) {
            return { success: false, error: deleteData.base_resp.status_msg || "删除音色失败" };
        }

        return { success: true };
    } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : "删除音色请求异常" };
    }
}

export async function submitQwenVoiceClone(channel: SystemModelChannel, config: VoiceCustomizationConfig, voiceId: string, name: string, audioBuffer: Buffer, audioFormat: string): Promise<CustomVoiceUpstreamResult> {
    try {
        const customizationPath = config.paths.customization || "/api/v1/services/audio/tts/customization";
        const audioBase64 = audioBuffer.toString("base64");
        const request = {
            voice: voiceId,
            audio_data: audioBase64,
            audio_format: audioFormat,
        };

        const response = await fetchSafeOutbound(`${channel.baseUrl}${customizationPath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.apiKey}` },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            const error = await response.text();
            return { status: "failed", failureReason: `音色克隆失败: ${error}` };
        }

        const data = (await response.json()) as QwenVoiceCustomizationResponse;
        if (data.code && data.code !== "Success") {
            return { status: "failed", failureReason: data.message || "音色克隆失败" };
        }
        if (!data.output?.voice) return { status: "failed", failureReason: "音色克隆返回无效" };

        const previewUrl = data.output.audio;
        return { status: "ready", upstreamVoiceId: data.output.voice, upstreamRequestId: data.request_id, previewUrl, previewMimeType: previewUrl ? "audio/mpeg" : undefined };
    } catch (error) {
        return { status: "failed", failureReason: error instanceof Error ? error.message : "音色克隆请求异常" };
    }
}

export async function submitQwenVoiceDesign(channel: SystemModelChannel, config: VoiceCustomizationConfig, voiceId: string, name: string, description: string, previewText?: string): Promise<CustomVoiceUpstreamResult> {
    try {
        const customizationPath = config.paths.customization || "/api/v1/services/audio/tts/customization";
        const request = {
            voice: voiceId,
            description,
            ...(previewText ? { preview_text: previewText } : {}),
        };

        const response = await fetchSafeOutbound(`${channel.baseUrl}${customizationPath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.apiKey}` },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            const error = await response.text();
            return { status: "failed", failureReason: `音色设计失败: ${error}` };
        }

        const data = (await response.json()) as QwenVoiceCustomizationResponse;
        if (data.code && data.code !== "Success") {
            return { status: "failed", failureReason: data.message || "音色设计失败" };
        }
        if (!data.output?.voice) return { status: "failed", failureReason: "音色设计返回无效" };

        const previewUrl = data.output.audio;
        return { status: "ready", upstreamVoiceId: data.output.voice, upstreamRequestId: data.request_id, previewUrl, previewMimeType: previewUrl ? "audio/mpeg" : undefined };
    } catch (error) {
        return { status: "failed", failureReason: error instanceof Error ? error.message : "音色设计请求异常" };
    }
}

export async function queryQwenVoiceStatus(channel: SystemModelChannel, upstreamVoiceId: string): Promise<CustomVoiceUpstreamResult> {
    try {
        const customizationPath = channel.advancedConfig?.voiceCustomization?.paths?.customization || "/api/v1/services/audio/tts/customization";
        const request = {
            model: "voice-enrollment",
            input: {
                action: "query_voice",
                voice_id: upstreamVoiceId,
            },
        };

        const response = await fetchSafeOutbound(`${channel.baseUrl}${customizationPath}`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${channel.apiKey}` },
            body: JSON.stringify(request),
        });

        if (!response.ok) {
            const error = await response.text();
            return { status: "failed", failureReason: `查询音色状态失败: ${error}` };
        }

        const data = (await response.json()) as { output?: { status?: string; resource_link?: string }; code?: string; message?: string; request_id?: string };
        if (data.code && data.code !== "Success") {
            return { status: "failed", failureReason: data.message || "查询音色状态失败" };
        }

        const upstreamStatus = data.output?.status;
        if (upstreamStatus === "OK") {
            return { status: "ready", upstreamVoiceId, upstreamRequestId: data.request_id, previewUrl: data.output?.resource_link, previewMimeType: "audio/wav" };
        }
        if (upstreamStatus === "UNDEPLOYED") {
            return { status: "failed", failureReason: "音色审核未通过" };
        }
        // DEPLOYING or other status, keep as creating
        return { status: "creating", upstreamVoiceId, upstreamRequestId: data.request_id };
    } catch (error) {
        return { status: "failed", failureReason: error instanceof Error ? error.message : "查询音色状态请求异常" };
    }
}
