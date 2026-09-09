import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { subscribeSettingsEvents } from "@/lib/server/settings-events";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return new Response("Unauthorized", { status: 401 });
    if (!hasAnyAdminPermission(user)) return new Response("Forbidden", { status: 403 });
    const encoder = new TextEncoder();
    let unsubscribe: () => void = () => undefined;
    const stream = new ReadableStream<Uint8Array>({
        start(controller) {
            const send = (revision: number) => {
                try {
                    controller.enqueue(encoder.encode(`event: settings-updated\ndata: ${JSON.stringify({ revision })}\n\n`));
                } catch {}
            };
            controller.enqueue(encoder.encode(": connected\n\n"));
            unsubscribe = subscribeSettingsEvents(send);
            request.signal.addEventListener(
                "abort",
                () => {
                    unsubscribe();
                    try {
                        controller.close();
                    } catch {}
                },
                { once: true },
            );
        },
        cancel() {
            unsubscribe();
        },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}
