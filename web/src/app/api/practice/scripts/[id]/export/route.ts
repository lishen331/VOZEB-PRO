import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
import { getScriptProjectDetail } from "@/lib/server/script-practice-service";
import { serializeFdx, serializeFountain, serializePlainText } from "@/lib/script-practice-contract";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type ExportFormat = "text" | "fountain" | "fdx" | "storyboard" | "storyboard_csv";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    await requirePracticeAccess(user, "script");
    try {
        await requirePracticeAccess(user, "script");
        const scope = await requirePracticeTenant(user, "script");
        const format = new URL(request.url).searchParams.get("format") || "text";
        if (!["text", "fountain", "fdx", "storyboard", "storyboard_csv"].includes(format)) return response(400, "不支持的导出格式");
        const projectId = (await context.params).id;
        const detail = await getScriptProjectDetail(user.id, projectId);
        const artifacts = await new ScriptAgentRepository({ query: postgresQuery }).listLatestArtifacts(scope, projectId);
        const episodeArtifact = artifacts.find((row) => row.artifact_type === "episode_scripts");
        const storyboardArtifact = artifacts.find((row) => row.artifact_type === "text_storyboard");
        if ((format === "storyboard" || format === "storyboard_csv") && !storyboardArtifact) return response(404, "文字分镜不存在");
        if (format !== "storyboard" && format !== "storyboard_csv" && !detail.document && !episodeArtifact) return response(404, "剧本文档不存在");
        const content =
            format === "storyboard" || format === "storyboard_csv"
                ? serializeStoryboard(storyboardArtifact, format === "storyboard_csv")
                : format === "fountain"
                  ? serializeFountain(detail.document!)
                  : format === "fdx"
                    ? serializeFdx(detail.document!)
                    : episodeArtifact?.content_text || serializePlainText(detail.document!);
        const csv = format === "storyboard_csv";
        const extension = format === "fdx" ? "fdx" : csv ? "csv" : format === "storyboard" ? "md" : "txt";
        const mime = format === "fdx" ? "application/xml" : csv ? "text/csv; charset=utf-8" : "text/plain; charset=utf-8";
        return new Response(content, { headers: { "Content-Type": mime, "Content-Disposition": `attachment; filename="script-${format}.${extension}"` } });
    } catch (error) {
        return failure(error, "导出剧本失败");
    }
}
function serializeStoryboard(row: Record<string, unknown> | undefined, csv: boolean) {
    const root = row?.content_json && typeof row.content_json === "object" ? (row.content_json as Record<string, unknown>) : {};
    const episodes = Array.isArray(root.episodes) ? root.episodes : [];
    const shots: Array<Record<string, unknown>> = episodes.flatMap((episode) => {
        const item = record(episode);
        const episodeNumber = String(item.episodeNumber || "");
        return (Array.isArray(item.shots) ? item.shots : []).map((shot) => ({ episodeNumber, ...record(shot) }) as Record<string, unknown>);
    });
    if (csv)
        return [
            "集数,镜头,景别,画面,运镜,动作,对白/旁白,时长（秒）",
            ...shots.map((shot) => [shot.episodeNumber, shot.shotNumber, shot.shotSize, shot.visualDescription, shot.cameraMovement, shot.action, shot.dialogue, shot.durationSeconds].map(csvCell).join(",")),
        ].join("\n");
    return episodes
        .map((episode) => {
            const item = record(episode);
            const rows = (Array.isArray(item.shots) ? item.shots : [])
                .map((shot) => {
                    const value = record(shot);
                    return `| ${value.shotNumber || ""} | ${value.shotSize || ""} | ${value.visualDescription || ""} | ${value.cameraMovement || ""} | ${value.action || ""} | ${value.durationSeconds || ""}秒 |`;
                })
                .join("\n");
            return `## 第${item.episodeNumber || ""}集\n\n| 镜头 | 景别 | 画面 | 运镜 | 动作 | 时长 |\n| --- | --- | --- | --- | --- | --- |\n${rows}`;
        })
        .join("\n\n");
}
function csvCell(value: unknown) {
    return `"${String(value ?? "")
        .replaceAll('"', '""')
        .replaceAll("\n", " ")}"`;
}
function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
function response(code: number, msg: string) {
    return NextResponse.json({ code, data: null, msg }, { status: code });
}
function failure(error: unknown, fallback: string) {
    const status = error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return response(status, status === 500 ? fallback : error instanceof Error ? error.message : fallback);
}
