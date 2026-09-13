import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
import { compareScriptArtifactTypes } from "@/lib/server/script-agent-domain";
type Context = { params: Promise<{ id: string }> };
const WORKFLOW_ORDER = ["creative_positioning", "short_story", "adaptation_strategy", "episode_scripts", "review_report", "director_plan", "text_storyboard", "asset_prompts"];
const DEFAULT_KEYS: Record<string, string> = {
    creative_positioning: "project",
    world_building: "project",
    short_story: "main",
    chapter_outlines: "all",
    story_skeleton: "main",
    adaptation_strategy: "main",
    episode_scripts: "all",
    review_report: "main",
    director_plan: "main",
    text_storyboard: "all",
    asset_prompts: "library",
};
const LABELS: Record<string, string> = {
    conversation: "Agent 对话",
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
    const [artifacts, runs] = await Promise.all([repository.listLatestArtifacts(scope, id), repository.listRuns(scope, id)]);
    const latestRun = runs[0];
    const activeRuns = latestRun && ["planning", "running", "waiting_confirmation", "partial_failed", "failed"].includes(latestRun.status) ? [latestRun] : [];
    const saved = new Map(artifacts.filter((row: Record<string, unknown>) => row.artifact_type !== "conversation").map((row: Record<string, unknown>) => [String(row.artifact_type), row]));
    const items = WORKFLOW_ORDER.map((type) => {
        const row = saved.get(type);
        return {
            id: row ? String(row.id) : `pending:${type}`,
            key: `${type}:${row?.artifact_key || DEFAULT_KEYS[type] || "main"}`,
            type,
            label: LABELS[type] || type,
            status: row ? String(row.status) : "not_started",
            version: row ? Number(row.version || 1) : 0,
        };
    });
    for (const row of artifacts) {
        const type = String(row.artifact_type);
        if (type === "conversation" || WORKFLOW_ORDER.includes(type)) continue;
        items.push({ id: String(row.id), key: `${type}:${row.artifact_key}`, type, label: LABELS[type] || type, status: String(row.status), version: Number(row.version || 1) });
    }
    items.sort((left, right) => compareScriptArtifactTypes(left.type, right.type));
    return NextResponse.json({ code: 0, data: { items, activeRuns }, msg: "ok" });
}
