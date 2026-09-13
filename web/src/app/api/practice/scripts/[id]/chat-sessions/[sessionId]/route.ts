import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";

type Context = { params: Promise<{ id: string; sessionId: string }> };
export async function PATCH(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return reply(401, null, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 64 * 1024);
    if (!parsed.ok) return reply(parsed.status, null, parsed.message);
    const title = typeof parsed.data.title === "string" ? parsed.data.title.trim().slice(0, 64) : "";
    if (!title) return reply(400, null, "请输入对话名称");
    const scope = await requirePracticeTenant(user, "script");
    const { id, sessionId } = await context.params;
    const session = await new ScriptAgentRepository({ query: postgresQuery }).updateChatSession(scope, id, sessionId, title);
    return session ? reply(0, session, "ok") : reply(404, null, "剧本对话不存在");
}
function reply<T>(code: number, data: T | null, msg: string) {
    return NextResponse.json({ code, data, msg }, { status: code === 0 ? 200 : code });
}
