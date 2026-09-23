/** Diagnostic-only budget agreed for this investigation; does not limit generation. */
export const MEDIA_DIAGNOSTIC_MAX_BYTES = 20 * 1024;
export const MEDIA_DIAGNOSTIC_RETENTION_MS = 7 * 86400000;
export type MediaDiagnosticEvent = { at: number; phase: string; [key: string]: string | number | boolean | undefined };
const stringFields = [
    "transportPolicy",
    "taskId",
    "nodeId",
    "projectId",
    "channelId",
    "model",
    "requestId",
    "upstreamTaskId",
    "state",
    "method",
    "contentType",
    "errorName",
    "errorCode",
    "size",
    "quality",
    "clientRequestId",
    "errorMessage",
    "cause",
    "parameters",
    "references",
    "protocol",
    "kind",
] as const;
const numberFields = ["status", "durationMs", "referenceCount", "responseBytes", "attemptNo", "firstByteMs", "idleMs", "contentLength"] as const;

export function sanitizeDiagnosticEvent(input: Record<string, unknown>, now = Date.now()): MediaDiagnosticEvent {
    const event: MediaDiagnosticEvent = { at: now, phase: typeof input.phase === "string" ? redactDiagnosticText(input.phase).slice(0, 64) : "unknown" };
    for (const key of stringFields) if (typeof input[key] === "string") event[key] = redactDiagnosticText(input[key]).slice(0, key === "errorMessage" || key === "references" ? 2048 : 512);
    for (const key of numberFields) if (typeof input[key] === "number" && Number.isFinite(input[key])) event[key] = input[key];
    if (typeof input.url === "string") {
        try {
            const url = new URL(input.url);
            if (url.protocol === "https:" || url.protocol === "http:") event.url = `${url.origin}${url.pathname}`.slice(0, 1024);
        } catch {
            /* Invalid URLs are not persisted. */
        }
    }
    return event;
}

export function appendDiagnosticEvent(current: MediaDiagnosticEvent[], input: Record<string, unknown>, now = Date.now()): MediaDiagnosticEvent[] {
    const event = sanitizeDiagnosticEvent(input, now);
    const events = current.filter((item) => item.at > now - MEDIA_DIAGNOSTIC_RETENTION_MS).map((item) => sanitizeDiagnosticEvent(item, item.at));
    const previous = event.phase === "poll" ? events.findLast((item) => item.phase === "poll" && item.state === event.state) : events.at(-1);
    if (event.phase === "poll" && previous && JSON.stringify({ ...previous, at: 0, durationMs: 0 }) === JSON.stringify({ ...event, at: 0, durationMs: 0 })) return events;
    events.push(event);
    while (events.length && Buffer.byteLength(JSON.stringify(events), "utf8") > MEDIA_DIAGNOSTIC_MAX_BYTES) events.splice(events.length > 1 ? 1 : 0, 1);
    return events;
}

/** Never persist credentials or media bytes embedded in provider errors. */
export function redactDiagnosticText(value: string, secrets: string[] = []): string {
    let text = value;
    for (const secret of secrets.filter(Boolean)) text = text.split(secret).join("[redacted]");
    return text
        .replace(/data:[^\s"']+/gi, "[media omitted]")
        .replace(/(?:\bBearer\s+|\bsk-)[a-zA-Z0-9._~+/=-]+/gi, "[redacted]")
        .replace(/https?:\/\/[^\s"'<>]+/gi, (raw) => {
            try {
                const url = new URL(raw);
                return url.origin + url.pathname;
            } catch {
                return "[url]";
            }
        })
        .replace(/((?:api[_-]?key|authorization|cookie|token|signature|password|secret)["']?\s*[:=]\s*)["']?[^\s,;}]+/gi, "$1[redacted]")
        .replace(/[A-Za-z0-9+/=]{256,}/g, "[blob omitted]");
}
