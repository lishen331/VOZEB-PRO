import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
type Context = { params: Promise<{ id: string }> };
const LABELS: Record<string, string> = {
    creative_positioning: "创作定位",
    world_building: "世界观",
    short_story_outline: "故事大纲",
    short_story: "完整短故事",
    novel_outline: "小说总纲",
    volume_outline: "卷纲",
    chapter_outlines: "章纲",
    story_skeleton: "故事骨架",
    adaptation_strategy: "改编策略",
    episode_outlines: "分集大纲",
    episode_scripts: "分集剧本",
    review_report: "剧本审核",
    director_plan: "导演规划",
    text_storyboard: "文字分镜",
    asset_prompts: "资产提示词",
};
export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const scope = await requirePracticeTenant(user, "script");
    const id = (await context.params).id;
    const repository = new ScriptAgentRepository({ query: postgresQuery });
    const [artifacts, runs] = await Promise.all([repository.listLatestArtifacts(scope, id), repository.listRuns(scope, id, ["planning", "running", "waiting_confirmation", "partial_failed"])]);
    const items = artifacts.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        key: `${row.artifact_type}:${row.artifact_key}`,
        type: String(row.artifact_type),
        label: LABELS[String(row.artifact_type)] || String(row.artifact_type),
        status: String(row.status),
        version: Number(row.version || 1),
    }));
    return NextResponse.json({ code: 0, data: { items, activeRuns: runs }, msg: "ok" });
}
