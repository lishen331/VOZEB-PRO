import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { persistMediaDiagnostic, type MediaDiagnosticContext } from "./media-task-diagnostic-store";
import { redactDiagnosticText } from "./media-task-diagnostics";

const scopes = new AsyncLocalStorage<MediaDiagnosticContext>();
export const MEDIA_TRACE_HEADER = "x-vozeb-media-trace-id";
type TaskLike = {
    id: string;
    userId: string;
    surface?: string;
    projectId?: string;
    config?: { channelId?: string; model?: string; size?: string; quality?: string; advancedConfig?: { protocol?: string } };
    references?: Array<{ id?: string; type?: string; inputKey?: string }>;
    clientRequestId?: string;
    attemptNo?: number;
};

export async function withMediaDiagnosticScope<T>(type: "image" | "video", task: TaskLike, phase: string, operation: () => Promise<T>): Promise<T> {
    if (task.surface !== "canvas" || process.env.CANVAS_MEDIA_DIAGNOSTICS === "0") return operation();
    const context: MediaDiagnosticContext = { type, taskId: task.id, userId: task.userId, surface: task.surface, projectId: task.projectId, channelId: task.config?.channelId, model: task.config?.model };
    return scopes.run(context, async () => {
        const started = Date.now();
        if (phase !== "recovery")
            await persistMediaDiagnostic(context, {
                phase: `${phase}_start`,
                clientRequestId: task.clientRequestId,
                attemptNo: task.attemptNo,
                nodeId: diagnosticNodeId(task),
                references: JSON.stringify(task.references?.map((ref, index) => ({ index, id: ref.id, type: ref.type, inputKey: ref.inputKey }))),
                referenceCount: task.references?.length,
                size: task.config?.size,
                quality: task.config?.quality,
                protocol: task.config?.advancedConfig?.protocol,
            });
        try {
            const result = await operation();
            const value = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
            const upstream = (value.upstream || value.pending) as { id?: string } | undefined;
            await persistMediaDiagnostic(context, {
                phase: phase === "recovery" && result === "pending" ? "poll" : `${phase}_end`,
                durationMs: Date.now() - started,
                state: typeof result === "string" ? result : value.status || value.state,
                upstreamTaskId: upstream?.id || (phase === "submit" && typeof value.id === "string" ? value.id : undefined),
            });
            return result;
        } catch (error) {
            await traceMediaException(error, `${phase}_exception`);
            throw error;
        }
    });
}

export async function traceMediaException(error: unknown, phase = "exception") {
    const context = scopes.getStore();
    if (!context) return;
    const value = error instanceof Error ? error : new Error(String(error));
    const cause = value.cause as { name?: string; code?: string; message?: string } | undefined;
    await persistMediaDiagnostic(context, { phase, errorName: value.name, errorMessage: value.message, errorCode: (value as Error & { code?: string }).code, cause: cause ? `${cause.name || ""} ${cause.code || ""} ${cause.message || ""}` : undefined });
}

export function currentMediaTraceHeaders(url: string, headers?: HeadersInit) {
    const context = scopes.getStore();
    if (!context || !new URL(url).pathname.startsWith("/api/ai/system/")) return headers;
    const next = new Headers(headers);
    next.set(MEDIA_TRACE_HEADER, context.taskId);
    return next;
}

function requestSummary(body: RequestInit["body"]) {
    const summary: Record<string, unknown> = {};
    // Proxy requests are byte buffers. Decode only small JSON metadata requests;
    // never decode large media uploads for diagnostics.
    if (body instanceof ArrayBuffer && body.byteLength <= 64 * 1024) body = new TextDecoder().decode(body);
    else if (ArrayBuffer.isView(body) && body.byteLength <= 64 * 1024) body = new TextDecoder().decode(body);
    // Do not serialize image data, prompts, authorization or arbitrary custom fields.
    const names = ["model", "size", "quality", "n", "seconds", "duration", "response_format", "output_format"];
    if (typeof body === "string") {
        try {
            const parsed = JSON.parse(body);
            for (const name of names) if (["string", "number", "boolean"].includes(typeof parsed?.[name])) summary[name] = parsed[name];
            if (typeof parsed?.prompt === "string") summary.promptHash = createHash("sha256").update(parsed.prompt).digest("hex");
        } catch {
            /* Unknown bodies are deliberately omitted. */
        }
    } else if (body instanceof FormData) {
        for (const name of names) {
            const value = body.get(name);
            if (typeof value === "string") summary[name] = value;
        }
        summary.files = [...body.values()].filter((value) => typeof value !== "string").map((file) => ({ size: file.size, type: file.type }));
    }
    return JSON.stringify(summary);
}

/** Passes the original Response through; error sampling only uses a clone. */
export async function observeMediaFetch(url: string, init: RequestInit | undefined, fetcher: () => Promise<Response>, explicit?: MediaDiagnosticContext): Promise<Response> {
    const context = explicit || scopes.getStore();
    if (!context || process.env.CANVAS_MEDIA_DIAGNOSTICS === "0") return fetcher();
    const stage = explicit ? "upstream" : "transport";
    const start = Date.now();
    if ((init?.method || "GET").toUpperCase() !== "GET") await persistMediaDiagnostic(context, { phase: `${stage}_request`, url, method: init?.method || "GET", parameters: requestSummary(init?.body) });
    try {
        const response = await fetcher();
        const authorization = new Headers(init?.headers).get("authorization")?.replace(/^Bearer\s+/i, "");
        let errorMessage: string | undefined;
        if (!response.ok && /json|text/i.test(response.headers.get("content-type") || "")) errorMessage = await boundedErrorMessage(response, authorization ? [authorization] : []);
        if ((init?.method || "GET").toUpperCase() !== "GET" || !response.ok)
            await persistMediaDiagnostic(context, {
                phase: `${stage}_response`,
                url,
                status: response.status,
                durationMs: Date.now() - start,
                contentType: response.headers.get("content-type"),
                requestId: response.headers.get("x-request-id") || response.headers.get("x-oneapi-request-id") || response.headers.get("request-id") || response.headers.get("x-amzn-requestid"),
                errorMessage,
            });
        return response;
    } catch (error) {
        const value = error instanceof Error ? error : new Error(String(error));
        const cause = value.cause as { code?: string; message?: string } | undefined;
        await persistMediaDiagnostic(context, { phase: `${stage}_exception`, url, durationMs: Date.now() - start, errorName: value.name, errorMessage: value.message, cause: cause ? `${cause.code || ""} ${cause.message || ""}` : undefined });
        throw error;
    }
}

async function boundedErrorMessage(response: Response, secrets: string[]) {
    const reader = response.clone().body?.getReader();
    if (!reader) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        // Diagnostic budget only; never changes the actual request signal or body.
        return await Promise.race([
            (async () => {
                const chunks: Uint8Array[] = [];
                let bytes = 0;
                while (bytes < 4096) {
                    const part = await reader.read();
                    if (part.done) break;
                    const chunk = part.value.subarray(0, 4096 - bytes);
                    chunks.push(chunk);
                    bytes += chunk.length;
                }
                const text = Buffer.concat(chunks).toString("utf8");
                try {
                    const json = JSON.parse(text);
                    const error = json.error;
                    return redactDiagnosticText(String(error?.message || (typeof error === "string" ? error : "") || json.message || json.msg || error?.code || ""), secrets).slice(0, 2048);
                } catch {
                    return redactDiagnosticText(text, secrets).slice(0, 2048);
                }
            })(),
            new Promise<undefined>((resolve) => {
                timer = setTimeout(() => resolve(undefined), 1000);
            }),
        ]);
    } catch {
        return;
    } finally {
        clearTimeout(timer);
        void reader.cancel().catch(() => {});
    }
}

export async function recordMediaTaskEvent(type: "image" | "video", task: TaskLike, event: Record<string, unknown>) {
    if (task.surface !== "canvas") return;
    await persistMediaDiagnostic(
        { type, taskId: task.id, userId: task.userId, surface: task.surface, projectId: task.projectId, channelId: task.config?.channelId, model: task.config?.model },
        { nodeId: diagnosticNodeId(task), clientRequestId: task.clientRequestId, ...event },
    );
}

export function diagnosticNodeId(task: Pick<TaskLike, "projectId" | "clientRequestId">) {
    const parts = task.clientRequestId?.split(":");
    return parts && /^canvas-(image|video)(-retry)?$/.test(parts[0]) && parts[1] === task.projectId ? parts[2] : undefined;
}
