import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; runId: string }> };
export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const scope = await requirePracticeTenant(user, "script");
        const { id, runId } = await context.params;
        const run = await new ScriptAgentRepository({ query: postgresQuery }).getRun(scope, id, runId);
        return run ? NextResponse.json({ code: 0, data: run, msg: "ok" }) : NextResponse.json({ code: 404, data: null, msg: "剧本 Run 不存在" }, { status: 404 });
    } catch {
        return NextResponse.json({ code: 500, data: null, msg: "读取剧本 Run 失败" }, { status: 500 });
    }
}
