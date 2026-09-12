import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
type Context = { params: Promise<{ id: string; artifactType: string; artifactKey: string }> };
export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const scope = await requirePracticeTenant(user, "script");
    const { id, artifactType, artifactKey } = await context.params;
    const items = await new ScriptAgentRepository({ query: postgresQuery }).listLatestArtifacts(scope, id);
    const artifact = items.find((row: Record<string, unknown>) => row.artifact_type === artifactType && row.artifact_key === artifactKey);
    return artifact ? NextResponse.json({ code: 0, data: artifact, msg: "ok" }) : NextResponse.json({ code: 404, data: null, msg: "成果不存在" }, { status: 404 });
}
