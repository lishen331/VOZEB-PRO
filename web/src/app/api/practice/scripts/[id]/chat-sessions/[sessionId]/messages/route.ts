import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
import { ScriptAgentRunService } from "@/lib/server/script-agent-run-service";
type Context = { params: Promise<{ id: string; sessionId: string }> };
export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return reply(401, null, "请先登录");
    const scope = await requirePracticeTenant(user, "script");
    const { id, sessionId } = await context.params;
    return reply(0, await new ScriptAgentRepository({ query: postgresQuery }).listChatMessages(scope, id, sessionId), "ok");
}
export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return reply(401, null, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 256 * 1024);
    if (!parsed.ok) return reply(parsed.status, null, parsed.message);
    const content = typeof parsed.data.content === "string" ? parsed.data.content.trim() : "";
    if (!content) return reply(400, null, "请输入内容");
    const scope = await requirePracticeTenant(user, "script");
    const { id, sessionId } = await context.params;
    const repository = new ScriptAgentRepository({ query: postgresQuery });
    const clientRequestId = typeof parsed.data.clientRequestId === "string" && parsed.data.clientRequestId.trim() ? parsed.data.clientRequestId.trim() : randomUUID();
    await repository.saveChatMessage(scope, { id: randomUUID(), sessionId, projectId: id, role: "user", publicContent: content });
    const run = await new ScriptAgentRunService(repository).create(scope, { projectId: id, chatSessionId: sessionId, runType: "conversation", clientRequestId, configSnapshot: { message: content } });
    return reply(0, run, "ok");
}
function reply<T>(code: number, data: T | null, msg: string) {
    return NextResponse.json({ code, data, msg }, { status: code === 0 ? 200 : code });
}
