import { NextRequest, NextResponse } from "next/server";
import { getAuthSettings } from "@/lib/auth/store";
import { getCurrentUser } from "@/lib/auth/session";
import { rawModelName } from "@/lib/server/generation-channel";
import { channelModelCapability, channelUsableForSurface } from "@/lib/model-routing-config";
import type { LogicalModelCapability } from "@/lib/auth/store-types";

export const dynamic = "force-dynamic";

export type PracticePoolCandidate = {
    upstreamModel: string;
    capability: LogicalModelCapability;
    channelId: string;
    channelName: string;
    purpose: string;
    inPool: boolean;
};

export type PracticePoolStats = {
    total: number;
    inPool: number;
    text: number;
    image: number;
    video: number;
    audio: number;
};

/**
 * GET /api/admin/practice-model-pool/candidates
 *
 * Returns all models from open-source-practice channels for the management UI.
 * Includes model name, capability, channel, and current pool status.
 */
export async function GET(request: NextRequest) {
    const user = await getCurrentUser(request);
    if (!user || user.role !== "admin") {
        return NextResponse.json({ error: "权限不足" }, { status: 403 });
    }

    const settings = await getAuthSettings();
    const poolConfig = settings.practiceModelPool?.models || {};

    // Collect all models from channels usable in the practice surface. Purpose still limits
    // visibility (production-only channels never appear), but the practice switch is what
    // decides whether the channel is on for 无限练习.
    const candidates: PracticePoolCandidate[] = settings.systemChannels
        .filter((channel) => channelUsableForSurface(channel, "open-source-practice"))
        .flatMap((channel) =>
            channel.models.map((model) => {
                const modelName = rawModelName(model);
                const modelKey = modelName.toLowerCase();
                const capability = channelModelCapability(channel, model);

                return {
                    upstreamModel: modelName,
                    capability,
                    channelId: channel.id,
                    channelName: channel.name || channel.id,
                    purpose: channel.purpose || "",
                    // Pool status: true=included, false=excluded, undefined fallback to true (default included)
                    inPool: poolConfig[modelKey] ?? true,
                };
            }),
        );

    // Calculate statistics by capability
    const stats: PracticePoolStats = {
        total: candidates.length,
        inPool: candidates.filter((c) => c.inPool).length,
        text: candidates.filter((c) => c.capability === "text").length,
        image: candidates.filter((c) => c.capability === "image").length,
        video: candidates.filter((c) => c.capability === "video").length,
        audio: candidates.filter((c) => c.capability === "audio").length,
    };

    return NextResponse.json({ candidates, stats });
}
