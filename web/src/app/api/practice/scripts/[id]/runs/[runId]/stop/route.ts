import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
import { ScriptAgentRunService } from "@/lib/server/script-agent-run-service";
type Context = { params: Promise<{ id: string; runId: string }> };
export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const scope = await requirePracticeTenant(user, "script");
    const { id, runId } = await context.params;
    const data = await new ScriptAgentRunService(new ScriptAgentRepository({ query: postgresQuery })).stop(scope, id, runId);
    return NextResponse.json({ code: 0, data, msg: "ok" });
}
