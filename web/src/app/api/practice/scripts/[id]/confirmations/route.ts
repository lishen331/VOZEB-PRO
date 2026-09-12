import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return reply(401, null, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 64 * 1024);
    if (!parsed.ok) return reply(parsed.status, null, parsed.message);
    const artifactId = typeof parsed.data.artifactId === "string" ? parsed.data.artifactId.trim() : "";
    const stageKey = typeof parsed.data.stageKey === "string" ? parsed.data.stageKey.trim() : "";
    if (!artifactId || !stageKey) return reply(400, null, "缺少待确认成果");
    const scope = await requirePracticeTenant(user, "script");
    const projectId = (await context.params).id;
    const data = await new ScriptAgentRepository({ query: postgresQuery }).confirmArtifact(scope, { id: randomUUID(), projectId, artifactId, stageKey, sourceRunId: typeof parsed.data.runId === "string" ? parsed.data.runId : undefined });
    return data ? reply(0, data, "ok") : reply(409, null, "该成果不是待确认状态");
}
function reply<T>(code: number, data: T | null, msg: string) {
    return NextResponse.json({ code, data, msg }, { status: code === 0 ? 200 : code });
}
