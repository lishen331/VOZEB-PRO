import { NextRequest, NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthInputError, getAuthSettings, isAuthInputError, type SystemModelChannel } from "@/lib/auth/store";
import { getCustomVoice, updateCustomVoice } from "@/lib/server/custom-voice-store";
import { deleteMinimaxVoice } from "@/lib/server/custom-voice-upstream";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const { id } = await params;
        const voice = await getCustomVoice(id);
        if (!voice) return NextResponse.json({ error: "Voice not found" }, { status: 404 });
        if (voice.ownerUserId !== user.id && !voice.shared) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        return NextResponse.json({ voice });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const { id } = await params;
        const voice = await getCustomVoice(id);
        if (!voice) return NextResponse.json({ error: "Voice not found" }, { status: 404 });
        if (voice.ownerUserId !== user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const body = await readJsonBody<{ name?: string; shared?: boolean }>(request);
        const update: { name?: string; shared?: boolean; lastUsedAt?: string } = {};
        if (body.name !== undefined) {
            const name = body.name.trim().slice(0, 50);
            if (!name) throw new AuthInputError("name cannot be empty");
            update.name = name;
        }
        if (body.shared !== undefined) {
            update.shared = Boolean(body.shared);
        }
        await updateCustomVoice(id, update);
        const updated = await getCustomVoice(id);
        return NextResponse.json({ voice: updated });
    } catch (error) {
        if (isAuthInputError(error)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const { id } = await params;
        const voice = await getCustomVoice(id);
        if (!voice) return NextResponse.json({ error: "Voice not found" }, { status: 404 });
        if (voice.ownerUserId !== user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const settings = await getAuthSettings();
        const channel = settings.systemChannels.find((ch): ch is SystemModelChannel =>
            ch.id === voice.channelId && ch.advancedConfig?.voiceCustomization !== undefined
        );
        if (channel && channel.advancedConfig?.voiceCustomization && voice.upstreamVoiceId) {
            try {
                if (voice.provider === "minimax") {
                    const { normalizeVoiceCustomization } = await import("@/lib/custom-voice-config");
                    const voiceConfig = normalizeVoiceCustomization(channel.advancedConfig.voiceCustomization);
                    if (voiceConfig) {
                        await deleteMinimaxVoice(channel, voiceConfig, voice.upstreamVoiceId);
                    }
                }
            } catch (error) {
                console.error(`Failed to delete upstream voice ${voice.upstreamVoiceId}:`, error);
            }
        }
        await updateCustomVoice(id, { status: "deleted" });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}
