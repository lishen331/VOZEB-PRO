import { NextResponse } from "next/server";

import { backfillAudioGenerationLogs } from "@/lib/server/audio-generation-log-backfill";
import { isAuthorizedMaintenanceRequest, isMaintenanceTokenConfigured } from "@/lib/server/maintenance-auth";
import { readRequestBodyBytes, RequestBodyTooLargeError } from "@/lib/server/request-body-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** 只有两个标量参数，几千字节足够；与其它接口一样走有界读取。 */
const MAX_BACKFILL_REQUEST_BYTES = 8 * 1024;

/** 补齐历史上缺失的音频调用记录；默认 dry-run，确认后再实写。 */
export async function POST(request: Request) {
    if (!isMaintenanceTokenConfigured()) return NextResponse.json({ code: 503, data: null, msg: "维护任务令牌未配置" }, { status: 503 });
    if (!isAuthorizedMaintenanceRequest(request)) return NextResponse.json({ code: 401, data: null, msg: "维护任务认证失败" }, { status: 401 });

    try {
        let body: { dryRun?: unknown; limit?: unknown } = {};
        try {
            const bytes = await readRequestBodyBytes(request, MAX_BACKFILL_REQUEST_BYTES);
            body = bytes.length ? (JSON.parse(new TextDecoder().decode(bytes)) as { dryRun?: unknown; limit?: unknown }) : {};
        } catch (error) {
            if (error instanceof RequestBodyTooLargeError) return NextResponse.json({ code: 413, data: null, msg: "请求体过大" }, { status: error.status });
            if (!(error instanceof SyntaxError)) throw error;
        }
        const result = await backfillAudioGenerationLogs({ dryRun: body.dryRun !== false, limit: Number(body.limit) || undefined });
        return NextResponse.json({ code: 0, data: result, msg: result.dryRun ? `预演：发现 ${result.missing} 条缺失音频记录` : `已补写 ${result.written} 条音频记录` });
    } catch (error) {
        console.error("Audio generation log backfill failed", error);
        return NextResponse.json({ code: 500, data: null, msg: "音频调用记录回填失败" }, { status: 500 });
    }
}
