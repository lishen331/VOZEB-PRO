import { NextResponse } from "next/server";

import { backfillAudioGenerationLogs } from "@/lib/server/audio-generation-log-backfill";
import { isAuthorizedMaintenanceRequest, isMaintenanceTokenConfigured } from "@/lib/server/maintenance-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 补齐历史上缺失的音频调用记录；默认 dry-run，确认后再实写。 */
export async function POST(request: Request) {
    if (!isMaintenanceTokenConfigured()) return NextResponse.json({ code: 503, data: null, msg: "维护任务令牌未配置" }, { status: 503 });
    if (!isAuthorizedMaintenanceRequest(request)) return NextResponse.json({ code: 401, data: null, msg: "维护任务认证失败" }, { status: 401 });

    try {
        const body = (await request.json().catch(() => ({}))) as { dryRun?: unknown; limit?: unknown };
        const result = await backfillAudioGenerationLogs({ dryRun: body.dryRun !== false, limit: Number(body.limit) || undefined });
        return NextResponse.json({ code: 0, data: result, msg: result.dryRun ? `预演：发现 ${result.missing} 条缺失音频记录` : `已补写 ${result.written} 条音频记录` });
    } catch (error) {
        console.error("Audio generation log backfill failed", error);
        return NextResponse.json({ code: 500, data: null, msg: "音频调用记录回填失败" }, { status: 500 });
    }
}
