/** Diagnostic-only budget agreed for this investigation; does not limit generation. */
export const MEDIA_DIAGNOSTIC_MAX_BYTES = 20 * 1024;
export const MEDIA_DIAGNOSTIC_RETENTION_MS = 7 * 86400000;
const DIAGNOSTIC_TEXT_SCAN_LIMIT = 16 * 1024;
export type MediaDiagnosticEvent = { at: number; phase: string; [key: string]: string | number | boolean | undefined };
const stringFields = [
    "operation",
    "upstreamCallId",
    "transportPolicy",
    "mediaReadId",
    "stage",
    "urlHost",
    "urlPathHash",
    "finalHost",
    "finalPathHash",
    "logicalModel",
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
    "contentEncoding",
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
    "stack",
] as const;
const STACK_DIAGNOSTIC_MAX_CHARS = 1500;
const numberFields = ["status", "durationMs", "referenceCount", "responseBytes", "attemptNo", "firstByteMs", "idleMs", "contentLength", "width", "height", "redirectCount"] as const;

export function sanitizeDiagnosticEvent(input: Record<string, unknown>, now = Date.now()): MediaDiagnosticEvent {
    const event: MediaDiagnosticEvent = { at: now, phase: typeof input.phase === "string" ? redactDiagnosticText(input.phase).slice(0, 64) : "unknown" };
    for (const key of stringFields) if (typeof input[key] === "string") event[key] = redactDiagnosticText(input[key]).slice(0, key === "stack" ? STACK_DIAGNOSTIC_MAX_CHARS : key === "errorMessage" || key === "references" ? 2048 : 512);
    for (const key of numberFields) if (typeof input[key] === "number" && Number.isFinite(input[key])) event[key] = input[key];
    for (const field of ["requestBody", "responseBody", "upstreamResultUrls"] as const) {
        if (typeof input[field] !== "string" || Buffer.byteLength(input[field]) > PAYLOAD_MAX_BYTES) continue;
        try {
            event[field] = diagnosticPayloadJson(JSON.parse(input[field]));
        } catch {
            // Old or malformed input must never leak as unstructured text.
        }
    }
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
    while (events.length && Buffer.byteLength(JSON.stringify(events), "utf8") > MEDIA_DIAGNOSTIC_MAX_BYTES) {
        // Keep submission evidence when repeated queries compete for the same task budget.
        const pollIndex = events.findIndex((item, index) => index < events.length - 1 && (item.operation === "query" || item.phase === "poll"));
        events.splice(pollIndex >= 0 ? pollIndex : events.length > 1 ? 1 : 0, 1);
    }
    return events;
}

/** Never persist credentials or media bytes embedded in provider errors. */
export function redactDiagnosticText(value: string, secrets: string[] = []): string {
    let text = value;
    for (const secret of secrets.filter(Boolean)) text = text.split(secret).join("[redacted]");
    // V8 overflows its regex stack on multi-MB base64 runs; callers keep at most 2KB.
    if (text.length > DIAGNOSTIC_TEXT_SCAN_LIMIT) text = text.slice(0, DIAGNOSTIC_TEXT_SCAN_LIMIT);
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

const PAYLOAD_MAX_BYTES = 4096;
const PRIVATE_KEY = /authorization|cookie|password|secret|credential|signature|apikey|accesskey|privatekey|token|^headers$|^key$|^sign$|^auth$/i;
const BINARY_KEY = /^(?:b64json|base64|imagebase64|videobase64|audiobase64|imagedata|videodata|audiodata|inlinedata|binary|dataurl)$/i;

/** Stable JSON for display, not a replay body. Never truncate serialized JSON mid-token. */
export function diagnosticPayloadJson(input: unknown, secrets: string[] = []): string | undefined {
    function clean(value: unknown, depth: number): unknown {
        if (depth > 8) return "[depth omitted]";
        if (typeof value === "string") return redactDiagnosticText(/^\/(?!\/)[^\s]*[?#]/.test(value) ? value.split(/[?#]/, 1)[0] : value, secrets);
        if (Array.isArray(value)) return value.map((item) => clean(item, depth + 1));
        if (!value || typeof value !== "object") return value;
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => {
                const name = key.replace(/[^a-z0-9]/gi, "");
                return [redactDiagnosticText(key, secrets), PRIVATE_KEY.test(name) ? "[redacted]" : BINARY_KEY.test(name) ? "[media omitted]" : clean(item, depth + 1)];
            }),
        );
    }
    const value = clean(input, 0);
    const json = JSON.stringify(value);
    if (json === undefined || Buffer.byteLength(json) <= PAYLOAD_MAX_BYTES) return json;
    const summary: Record<string, unknown> = { _diagnostic: "payload truncated" };
    if (value && typeof value === "object" && !Array.isArray(value)) {
        for (const [key, item] of Object.entries(value)) {
            if (key === "_diagnostic") continue;
            const candidate = typeof item === "string" && item.length > 1024 ? item.slice(0, 1024) + "…" : item;
            if (Buffer.byteLength(JSON.stringify({ ...summary, [key]: candidate })) <= PAYLOAD_MAX_BYTES) Object.defineProperty(summary, key, { value: candidate, enumerable: true });
        }
    }
    return JSON.stringify(summary);
}
