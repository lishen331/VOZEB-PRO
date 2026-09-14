import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
import { ScriptAgentRunService } from "@/lib/server/script-agent-run-service";
import { nextShortFilmRunType } from "@/lib/server/script-agent-executor";
import { confirmScriptArtifactAndStartNext } from "@/lib/server/script-agent-confirmation-service";
type Context = { params: Promise<{ id: string; sessionId: string }> };
export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return reply(401, null, "请先登录");
    const scope = await requirePracticeTenant(user, "script");
    const { id, sessionId } = await context.params;
    const repository = new ScriptAgentRepository({ query: postgresQuery });
    if (!(await repository.getChatSession(scope, id, sessionId))) return reply(404, null, "剧本对话不存在");
    return reply(0, await repository.listChatMessages(scope, id, sessionId), "ok");
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
    if (!(await repository.getChatSession(scope, id, sessionId))) return reply(404, null, "剧本对话不存在");
    const saved = await repository.saveChatMessage(scope, { id: randomUUID(), sessionId, projectId: id, role: "user", publicContent: content, clientRequestId });
    if (!saved) return reply(409, null, "剧本对话已变化，请刷新后重试");
    const artifacts = await repository.listLatestArtifacts(scope, id);
    const confirmation = isNaturalConfirmation(content);
    const pending = artifacts.find((row) => row.status === "awaiting_review" && ["creative_positioning", "short_story", "adaptation_strategy", "review_report"].includes(String(row.artifact_type)));
    if (confirmation && pending) {
        const progressed = await confirmScriptArtifactAndStartNext(scope, {
            projectId: id,
            artifactId: String(pending.id),
            stageKey: String(pending.artifact_type),
            sourceRunId: String(pending.source_run_id || "") || undefined,
            chatSessionId: sessionId,
        });
        if (progressed) return reply(0, { id: progressed.nextRun?.id || progressed.confirmation.id, status: progressed.nextRun?.status || "success", nextRun: progressed.nextRun || undefined, confirmation: progressed.confirmation }, "ok");
    }
    const advanceWorkflow = confirmation;
    const nextRunType = advanceWorkflow ? nextShortFilmRunType(artifacts) : undefined;
    const run = await new ScriptAgentRunService(repository).create(scope, {
        projectId: id,
        chatSessionId: sessionId,
        runType: "conversation",
        clientRequestId,
        configSnapshot: { message: content, advanceWorkflow, ...(nextRunType ? { nextRunType } : {}) },
    });
    return reply(0, run, "ok");
}
function isNaturalConfirmation(content: string) {
    const normalized = content.trim();
    if (/(?:不(?:同意|认同|可以)|不同意|不要|别|否定|修改|改成|但是|不过|先不要|我想换)/i.test(normalized)) return false;
    if (/^(?:确认|确定|继续|可以|好的|好|是的|对的|开始|没问题)[。！!，,、\s]*$/i.test(normalized)) return true;
    return /(?:确认进入下一步|进入下一步|我(?:同意|认同)(?:了你的想法)?|按你的想法来|按这个(?:方向)?来|就这样|没问题|我觉得很可以[，,。！!\s]*按)/i.test(normalized);
}
function reply<T>(code: number, data: T | null, msg: string) {
    return NextResponse.json({ code, data, msg }, { status: code === 0 ? 200 : code });
}
