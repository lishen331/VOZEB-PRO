import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthInputError, getAuthSettings, isAuthInputError, type SystemModelChannel } from "@/lib/auth/store";
import { customVoiceCreatePoints, normalizeVoiceCustomization } from "@/lib/custom-voice-config";
import { createCustomVoice, listCustomVoices, updateCustomVoice } from "@/lib/server/custom-voice-store";
import { submitMinimaxVoiceClone, submitMinimaxVoiceDesign, submitQwenVoiceClone, submitQwenVoiceDesign, upstreamVoicePrefix } from "@/lib/server/custom-voice-upstream";
import { chargeGeneration, refundGenerationCharge } from "@/lib/server/generation-charge-service";
import { writePersistentMediaDataUrl } from "@/lib/server/reference-asset-store";

/** 上游返回的 Base64 试听音频落盘，换成可播放地址。失败不影响音色本身，只丢掉试听。 */
async function persistVoicePreview(voiceId: string, base64: string, mimeType: string) {
    try {
        const extension = mimeType === "audio/wav" ? "wav" : mimeType === "audio/mp4" ? "m4a" : "mp3";
        const stored = await writePersistentMediaDataUrl(`data:${mimeType};base64,${base64}`, "audio", { ownerUserId: "system", source: "custom-voice-preview", originalName: `${voiceId}.${extension}` });
        return stored.url;
    } catch {
        return undefined;
    }
}

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const searchParams = request.nextUrl.searchParams;
        const ttsModel = searchParams.get("ttsModel")?.trim() || undefined;
        const shared = searchParams.get("shared") === "true" || undefined;
        const includeOwned = searchParams.get("includeOwned") !== "false";
        const voices = await listCustomVoices({ ownerUserId: user.id, ttsModel, shared, includeOwned });
        return NextResponse.json({ voices });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const body = await readJsonBody<{ kind: string; name: string; ttsModel: string; audioData?: string; audioFormat?: string; prompt?: string; previewText?: string }>(request);
        const kind = body.kind === "clone" || body.kind === "design" ? body.kind : null;
        if (!kind) throw new AuthInputError("kind must be 'clone' or 'design'");
        const name = body.name?.trim().slice(0, 50);
        if (!name) throw new AuthInputError("name is required");
        const ttsModel = body.ttsModel?.trim().slice(0, 100);
        if (!ttsModel) throw new AuthInputError("ttsModel is required");
        const settings = await getAuthSettings();
        const usdToCny = settings.voicePricing?.usdToCny ?? 7.1;
        const pointsPerYuan = settings.voicePricing?.pointsPerYuan ?? 0;
        if (pointsPerYuan <= 0) {
            return NextResponse.json({ error: "Voice pricing not configured" }, { status: 503 });
        }
        const channel = settings.systemChannels.find((ch): ch is SystemModelChannel => ch.models.includes(ttsModel) && ch.advancedConfig?.voiceCustomization !== undefined);
        if (!channel || !channel.advancedConfig?.voiceCustomization) {
            return NextResponse.json({ error: "Channel not found or voice customization not enabled" }, { status: 404 });
        }
        const voiceConfig = normalizeVoiceCustomization(channel.advancedConfig.voiceCustomization);
        if (!voiceConfig) {
            return NextResponse.json({ error: "Invalid voice customization config" }, { status: 500 });
        }
        const points = customVoiceCreatePoints(voiceConfig, kind, usdToCny, pointsPerYuan);
        const idempotencyKey = `custom-voice-${randomUUID()}`;
        const receipt = await chargeGeneration({
            userId: user.id,
            amount: points,
            units: 1,
            usageKind: "audio",
            model: ttsModel,
            idempotencyKey,
            requestFingerprint: `custom-voice-${kind}`,
        });
        const voiceId = randomUUID();
        const voice = await createCustomVoice({
            id: voiceId,
            ownerUserId: user.id,
            channelId: channel.id,
            provider: voiceConfig.provider,
            ttsModel,
            kind,
            name,
        });
        try {
            let result;
            const prefix = upstreamVoicePrefix(voiceId);
            if (kind === "clone") {
                const audioData = body.audioData?.trim();
                if (!audioData) throw new AuthInputError("audioData required for clone");
                const audioBuffer = Buffer.from(audioData, "base64");
                const audioFormat = body.audioFormat?.trim().slice(0, 10) || "mp3";
                if (audioBuffer.length > voiceConfig.audioLimits.maxMB * 1024 * 1024) {
                    throw new AuthInputError(`Audio file too large (max ${voiceConfig.audioLimits.maxMB}MB)`);
                }
                if (voiceConfig.provider === "minimax") {
                    result = await submitMinimaxVoiceClone(channel, voiceConfig, voiceId, { data: audioBuffer, format: audioFormat });
                } else {
                    result = await submitQwenVoiceClone(channel, voiceConfig, ttsModel, prefix, { data: audioBuffer, format: audioFormat });
                }
            } else {
                const prompt = body.prompt?.trim().slice(0, voiceConfig.designLimits.promptMax);
                if (!prompt) throw new AuthInputError("prompt required for design");
                const previewText = body.previewText?.trim().slice(0, voiceConfig.designLimits.previewTextMax);
                if (!previewText || previewText.length < voiceConfig.designLimits.previewTextMin) {
                    throw new AuthInputError(`previewText must be ${voiceConfig.designLimits.previewTextMin}-${voiceConfig.designLimits.previewTextMax} characters`);
                }
                if (voiceConfig.provider === "minimax") {
                    result = await submitMinimaxVoiceDesign(channel, voiceConfig, prompt, previewText);
                } else {
                    result = await submitQwenVoiceDesign(channel, voiceConfig, ttsModel, prefix, prompt, previewText);
                }
            }
            // 千问设计的试听音频是 Base64，落库前换成可播放的地址。
            const previewUrl = result.previewAudioBase64 ? await persistVoicePreview(voiceId, result.previewAudioBase64, result.previewMimeType || "audio/mpeg") : result.previewUrl;
            await updateCustomVoice(voiceId, {
                chargeReceiptId: receipt.receiptId,
                upstreamRequestId: result.upstreamRequestId,
                status: result.status,
                upstreamVoiceId: result.upstreamVoiceId,
                previewUrl,
                previewMimeType: result.previewMimeType,
                failureReason: result.failureReason,
            });
            return NextResponse.json({ voice: { ...voice, ...result, chargeReceiptId: receipt.receiptId } });
        } catch (error: unknown) {
            await updateCustomVoice(voiceId, { status: "failed", failureReason: error instanceof Error ? error.message : "Unknown error" });
            await refundGenerationCharge({ userId: user.id, receiptId: receipt.receiptId, model: ttsModel, usageKind: "audio", units: 1, idempotencyKey: `refund-${idempotencyKey}` });
            throw error;
        }
    } catch (error) {
        if (isAuthInputError(error)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}
