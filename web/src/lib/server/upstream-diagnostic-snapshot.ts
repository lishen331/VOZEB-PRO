import { diagnosticPayloadJson, redactDiagnosticText } from "./media-task-diagnostics";

// Same bounded metadata input used by the existing diagnostic request summary.
const MAX_INPUT_BYTES = 64 * 1024;

function parseBody(body: RequestInit["body"]) {
    try {
        if (typeof body === "string" && Buffer.byteLength(body) <= MAX_INPUT_BYTES) return JSON.parse(body) as unknown;
        if ((body instanceof ArrayBuffer || ArrayBuffer.isView(body)) && body.byteLength <= MAX_INPUT_BYTES) return JSON.parse(new TextDecoder().decode(body)) as unknown;
    } catch {
        // Never store a raw unstructured body as a JSON snapshot.
    }
    return undefined;
}

export function upstreamRequestSnapshot(body: RequestInit["body"], secrets: string[] = []) {
    if (body instanceof FormData) {
        const values = new Map<string, unknown[]>();
        for (const [key, item] of body) {
            const items = values.get(key) ?? [];
            items.push(typeof item === "string" ? item : { type: item.type, bytes: item.size });
            values.set(key, items);
        }
        return diagnosticPayloadJson(Object.fromEntries([...values].map(([key, items]) => [key, items.length === 1 ? items[0] : items])), secrets);
    }
    return diagnosticPayloadJson(parseBody(body), secrets);
}

function record(value: unknown): Record<string, unknown> | undefined {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function configuredValue(root: unknown, path?: string): unknown {
    return path?.split(".").reduce<unknown>((value, key) => record(value)?.[key], root);
}

function readResultUrls(payload: unknown, configuredResult: unknown, secrets: string[] = []): string[] {
    const urls = new Set<string>();
    function scan(value: unknown, key = "", depth = 0) {
        if (depth > 8 || urls.size >= 9) return;
        if (typeof value === "string" && /^(?:url|result_?url|image_?url|video_?url|audio_?url|file_?url|uri)$/i.test(key) && /^https?:\/\//i.test(value)) {
            const safe = redactDiagnosticText(value, secrets);
            if (/^https?:\/\//i.test(safe)) urls.add(safe);
        } else if (Array.isArray(value)) {
            for (const item of value) scan(item, key, depth + 1);
        } else if (value && typeof value === "object") {
            for (const [name, item] of Object.entries(value)) {
                if (/^(?:data|output|outputs|result|results|images|videos|artifacts|response|url|result_?url|image_?url|video_?url|audio_?url|file_?url|uri)$/i.test(name)) scan(item, name, depth + 1);
            }
        }
    }
    scan(configuredResult, "url");
    scan(payload);
    return [...urls];
}

export function upstreamResponseSnapshot(body: ArrayBuffer, options: { secrets?: string[]; taskIdField?: string; statusField?: string; resultField?: string; successCodes?: string[]; httpOk?: boolean } = {}) {
    const payload = parseBody(body);
    const root = record(payload);
    const data = record(root?.data);
    const output = record(root?.output);
    const result = record(root?.result);
    const envelope = [result, data, output, root];
    const text = (value: unknown) => (typeof value === "string" || typeof value === "number" ? redactDiagnosticText(String(value), options.secrets).trim() : "");
    const read = (keys: string[]) => envelope.flatMap((object) => keys.map((key) => text(object?.[key]))).find(Boolean);
    const state = text(configuredValue(root, options.statusField)) || read(["status", "state", "task_status", "taskStatus"]);
    const upstreamTaskId =
        text(configuredValue(root, options.taskIdField)) ||
        read(["taskId", "task_id", "taskID", "job_id", "video_id"]) ||
        (state ? read(["id"]) : undefined) ||
        (typeof root?.name === "string" && /(?:^|\/)operations\//.test(root.name) ? text(root.name) : undefined);
    const error = result?.error ?? data?.error ?? output?.error ?? root?.error;
    const code = text(root?.code) || read(["code"]);
    const envelopeRejected = Boolean(code && options.successCodes?.length && !options.successCodes.includes(code));
    const rejected = options.httpOk === false || Boolean(error) || /fail|error|reject|cancel/i.test(state || "") || envelopeRejected;
    const pending = /^(?:pending|queued|submitted|processing|running|in_progress)$/i.test(state || "");
    const urls = rejected || pending ? [] : readResultUrls(payload, configuredValue(root, options.resultField), options.secrets);
    return {
        responseBody: diagnosticPayloadJson(payload, options.secrets),
        upstreamResultUrls: urls.length ? diagnosticPayloadJson(urls) : undefined,
        upstreamTaskId,
        state,
        errorCode: rejected ? text(record(error)?.code) || read(["error_code", "errorCode"]) || (options.httpOk === false || envelopeRejected ? code : undefined) : undefined,
        errorMessage: rejected ? text(record(error)?.message ?? error) || read(["error_message", "errorMessage", "fail_reason", "message", "msg"]) : undefined,
    };
}
