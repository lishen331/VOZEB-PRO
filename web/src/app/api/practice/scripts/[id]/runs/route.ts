import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { isScriptRunType } from "@/lib/server/script-agent-domain";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
import { ScriptAgentRunService } from "@/lib/server/script-agent-run-service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return reply(401, null, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 256 * 1024);
    if (!parsed.ok) return reply(parsed.status, null, parsed.message);
    try {
        const scope = await requirePracticeTenant(user, "script");
        const projectId = (await context.params).id;
        const runType = parsed.data.runType;
        if (!isScriptRunType(runType)) return reply(400, null, "剧本 Run 类型无效");
        const clientRequestId = typeof parsed.data.clientRequestId === "string" ? parsed.data.clientRequestId.trim() : "";
        if (!clientRequestId) return reply(400, null, "缺少请求身份");
        const data = await new ScriptAgentRunService(new ScriptAgentRepository({ query: postgresQuery })).create(scope, {
            projectId,
            runType,
            clientRequestId,
            chatSessionId: typeof parsed.data.chatSessionId === "string" ? parsed.data.chatSessionId : undefined,
            stageKey: typeof parsed.data.stageKey === "string" ? parsed.data.stageKey : undefined,
            configSnapshot: typeof parsed.data.input === "object" && parsed.data.input ? (parsed.data.input as Record<string, unknown>) : {},
        });
        return reply(0, data, "ok");
    } catch (error) {
        const status = error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
        return reply(status, null, status === 500 ? "创建剧本 Run 失败" : error instanceof Error ? error.message : "创建剧本 Run 失败");
    }
}
function reply<T>(code: number, data: T | null, msg: string) {
    return NextResponse.json({ code, data, msg }, { status: code === 0 ? 200 : code });
}
