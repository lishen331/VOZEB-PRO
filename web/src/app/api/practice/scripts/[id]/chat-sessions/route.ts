import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return reply(401, null, "请先登录");
    const scope = await requirePracticeTenant(user, "script");
    const id = (await context.params).id;
    return reply(0, await new ScriptAgentRepository({ query: postgresQuery }).listChatSessions(scope, id), "ok");
}
export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return reply(401, null, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 64 * 1024);
    if (!parsed.ok) return reply(parsed.status, null, parsed.message);
    const scope = await requirePracticeTenant(user, "script");
    const id = (await context.params).id;
    const title = typeof parsed.data.title === "string" && parsed.data.title.trim() ? parsed.data.title.trim().slice(0, 64) : "新对话";
    return reply(0, await new ScriptAgentRepository({ query: postgresQuery }).createChatSession(scope, { id: randomUUID(), projectId: id, title }), "ok");
}
function reply<T>(code: number, data: T | null, msg: string) {
    return NextResponse.json({ code, data, msg }, { status: code === 0 ? 200 : code });
}
