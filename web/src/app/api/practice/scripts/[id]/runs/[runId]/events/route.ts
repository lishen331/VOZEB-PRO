import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeTenant } from "@/lib/server/practice-tenant-scope";
import { ScriptAgentRepository } from "@/lib/server/database/script-agent-repository";
import { postgresQuery } from "@/lib/server/database/postgres";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; runId: string }> };
export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return new Response("未登录", { status: 401 });
    const scope = await requirePracticeTenant(user, "script");
    const { id, runId } = await context.params;
    const url = new URL(request.url);
    const header = Number(request.headers.get("last-event-id") || 0);
    const query = Number(url.searchParams.get("afterSequence") || 0);
    const events = await new ScriptAgentRepository({ query: postgresQuery }).listRunEvents(scope, id, runId, Math.max(header, query), 500);
    const encoder = new TextEncoder();
    const body = new ReadableStream({
        start(controller) {
            for (const event of events)
                controller.enqueue(encoder.encode(`id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify({ runId: event.runId, sequence: event.sequence, type: event.type, occurredAt: event.createdAt, data: event.data })}\n\n`));
            controller.enqueue(encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ runId, sequence: events.at(-1)?.sequence || Math.max(header, query), type: "heartbeat", occurredAt: new Date().toISOString(), data: {} })}\n\n`));
            controller.close();
        },
    });
    return new Response(body, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
