import { randomUUID } from "node:crypto";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
import { createDefaultScriptAgentExecutor } from "@/lib/server/script-agent-executor";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; runId: string }> };
export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return new Response("未登录", { status: 401 });
    const scope = await requirePracticeTenant(user, "script");
    const { id, runId } = await context.params;
    const url = new URL(request.url);
    const cursor = Math.max(Number(request.headers.get("last-event-id") || 0), Number(url.searchParams.get("afterSequence") || 0));
    const repository = new ScriptAgentRepository({ query: postgresQuery });
    const run = await repository.getRun(scope, id, runId);
    if (!run) return new Response("Run 不存在", { status: 404 });
    const encoder = new TextEncoder();
    const body = new ReadableStream({
        async start(controller) {
            let last = cursor;
            const send = (event: { sequence: number; type: string; runId: string; createdAt: string; data: Record<string, unknown> }) => {
                last = event.sequence;
                controller.enqueue(encoder.encode(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify({ runId: event.runId, sequence: event.sequence, type: event.type, occurredAt: event.createdAt, data: event.data })}\n\n`));
            };
            try {
                for (const event of await repository.listRunEvents(scope, id, runId, cursor, 500)) send(event);
                const claimed = await repository.claimRun(scope, id, runId);
                if (claimed) {
                    const liveRepository = new Proxy(repository, {
                        get(target, prop) {
                            if (prop !== "appendRunEvent") return Reflect.get(target, prop);
                            return async (...args: Parameters<ScriptAgentRepository["appendRunEvent"]>) => {
                                const event = await target.appendRunEvent(...args);
                                if (event) send(event);
                                return event;
                            };
                        },
                    });
                    const executor = createDefaultScriptAgentExecutor(liveRepository);
                    await executor.execute(scope, { projectId: id, runId, runType: claimed.runType, input: claimed.configSnapshot, origin: new URL(request.url).origin, cookie: request.headers.get("cookie") || "" });
                    await repository.updateRun(scope, id, runId, { status: "success", completedAt: new Date().toISOString() });
                    const done = await repository.appendRunEvent(scope, id, runId, "run_completed", {}, randomUUID());
                    if (done) send(done);
                }
                controller.enqueue(encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ runId, sequence: last, type: "heartbeat", occurredAt: new Date().toISOString(), data: {} })}\n\n`));
            } catch (error) {
                await repository.updateRun(scope, id, runId, { status: "failed", completedAt: new Date().toISOString(), errorMessage: error instanceof Error ? error.message : "剧本生成失败" }).catch(() => null);
                const failed = await repository.appendRunEvent(scope, id, runId, "error", { message: error instanceof Error ? error.message : "剧本生成失败" }, randomUUID()).catch(() => null);
                if (failed) send(failed);
            } finally {
                controller.close();
            }
        },
    });
    return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
