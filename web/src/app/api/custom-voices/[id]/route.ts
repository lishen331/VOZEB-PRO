import { NextRequest, NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { AuthInputError, isAuthInputError } from "@/lib/auth/store";
import { getCustomVoice, updateCustomVoice } from "@/lib/server/custom-voice-store";
import { queryQwenVoiceStatus } from "@/lib/server/custom-voice-upstream";
import { getAuthSettings } from "@/lib/auth/store";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const { id } = await context.params;
        const voice = await getCustomVoice(id);
        if (!voice) return NextResponse.json({ error: "Voice not found" }, { status: 404 });

        // If voice is still creating and it's a qwen voice, try to refresh status
        if (voice.status === "creating" && voice.provider === "qwen") {
            const settings = await getAuthSettings();
            const channel = settings.systemChannels.find((ch) => ch.id === voice.channelId);
            if (channel?.advancedConfig?.voiceCustomization) {
                try {
                    const statusResult = await queryQwenVoiceStatus(channel, voice.upstreamVoiceId!);
                    if (statusResult.status !== voice.status) {
                        await updateCustomVoice(id, {
                            status: statusResult.status,
                            failureReason: statusResult.failureReason,
                            previewUrl: statusResult.previewUrl,
                            previewMimeType: statusResult.previewMimeType,
                        });
                        return NextResponse.json({ voice: { ...voice, ...statusResult } });
                    }
                } catch (error) {
                    // Failed to query status, return current voice data
                    console.error("Failed to query qwen voice status:", error);
                }
            }
        }

        return NextResponse.json({ voice });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const { id } = await context.params;
        const voice = await getCustomVoice(id);
        if (!voice) return NextResponse.json({ error: "Voice not found" }, { status: 404 });
        if (voice.ownerUserId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const body = await readJsonBody<{ name?: string; shared?: boolean }>(request);
        const update: { name?: string; shared?: boolean } = {};

        if (body.name !== undefined) {
            const name = body.name.trim().slice(0, 50);
            if (!name) throw new AuthInputError("name cannot be empty");
            update.name = name;
        }

        if (body.shared !== undefined) {
            update.shared = Boolean(body.shared);
        }

        if (Object.keys(update).length === 0) {
            throw new AuthInputError("No valid fields to update");
        }

        await updateCustomVoice(id, update);
        return NextResponse.json({ success: true });
    } catch (error) {
        if (isAuthInputError(error)) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const { id } = await context.params;
        const voice = await getCustomVoice(id);
        if (!voice) return NextResponse.json({ error: "Voice not found" }, { status: 404 });
        if (voice.ownerUserId !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        // Mark as deleted without calling upstream delete API (upstream may auto-expire)
        await updateCustomVoice(id, { status: "deleted" });
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}
