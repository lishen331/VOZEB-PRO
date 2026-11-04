import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getAuthSettings, type SystemModelChannel } from "@/lib/auth/store";
import { DEFAULT_VOICE_USD_TO_CNY, normalizeVoiceCustomization } from "@/lib/custom-voice-config";

// 客户端音色面板需要的「当前模型能不能创建自定义音色、创建要扣多少积分」。
// /api/model-catalog 有意不下发渠道配置，这里只暴露命中的那一个模型的音色配置，
// 且 normalizeVoiceCustomization 本身不包含任何上游凭据。
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        const ttsModel = request.nextUrl.searchParams.get("ttsModel")?.trim() || undefined;
        if (!ttsModel) return NextResponse.json({ error: "ttsModel is required" }, { status: 400 });

        const settings = await getAuthSettings();
        const channel = settings.systemChannels.find((item): item is SystemModelChannel => item.models.includes(ttsModel) && item.advancedConfig?.voiceCustomization !== undefined);
        if (!channel?.advancedConfig?.voiceCustomization) return NextResponse.json({ enabled: false });

        const config = normalizeVoiceCustomization(channel.advancedConfig.voiceCustomization);
        if (!config) return NextResponse.json({ enabled: false });

        const usdToCny = settings.voicePricing?.usdToCny ?? DEFAULT_VOICE_USD_TO_CNY;
        const pointsPerYuan = settings.voicePricing?.pointsPerYuan ?? 0;
        return NextResponse.json({
            enabled: pointsPerYuan > 0,
            channelId: channel.id,
            config,
            ...(pointsPerYuan > 0 ? { pricing: { usdToCny, pointsPerYuan } } : {}),
        });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
    }
}
