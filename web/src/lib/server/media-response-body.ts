/** Read the same response once, preserving its bytes and original read error. */
export async function readObservedResponseBody(response: Response, record: (event: Record<string, unknown>) => void | Promise<void>, signal?: AbortSignal): Promise<ArrayBuffer> {
    const started = Date.now();
    let bytes = 0;
    let firstByteMs = -1;
    let lastByteAt = started;
    const chunks: Uint8Array[] = [];
    const emit = async (event: Record<string, unknown>) => {
        try {
            await record(event);
        } catch {
            /* Diagnostics must not alter response handling. */
        }
    };
    const reader = response.body?.getReader();
    const snapshot = () => ({ responseBytes: bytes, firstByteMs, durationMs: Date.now() - started, idleMs: Date.now() - lastByteAt, contentLength: Number(response.headers.get("content-length") || -1), contentType: response.headers.get("content-type") });
    try {
        if (reader) {
            while (true) {
                const part = await reader.read();
                if (part.done) break;
                chunks.push(part.value);
                bytes += part.value.byteLength;
                lastByteAt = Date.now();
                if (firstByteMs === -1) {
                    firstByteMs = Date.now() - started;
                    await emit({ phase: "upstream_body_first_byte", ...snapshot() });
                }
            }
        }
        await emit({ phase: "upstream_body_complete", ...snapshot() });
        const result = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return result.buffer;
    } catch (error) {
        const value = error instanceof Error ? error : new Error(String(error));
        const cause = value.cause as { code?: string; message?: string } | undefined;
        await emit({ phase: "upstream_body_exception", ...snapshot(), errorName: value.name, errorMessage: value.message, errorCode: cause?.code, cause: cause?.message, state: signal?.aborted ? "request_signal_aborted" : "body_read_failed" });
        throw error;
    } finally {
        reader?.releaseLock();
    }
}

/** Observe media incrementally without cloning, buffering or reading ahead of the consumer. */
export function observeMediaResponseStream(response: Response, record: (event: Record<string, unknown>) => void | Promise<void>): Response {
    if (!response.body) return response;
    const reader = response.body.getReader();
    const started = Date.now();
    let bytes = 0;
    let firstByteMs = -1;
    let finished = false;
    const emit = async (event: Record<string, unknown>) => {
        try {
            await record({ stage: "body", status: response.status, responseBytes: bytes, firstByteMs, durationMs: Date.now() - started, ...event });
        } catch {
            /* Observation never changes delivery. */
        }
    };
    const body = new ReadableStream<Uint8Array>(
        {
            async pull(controller) {
                try {
                    const part = await reader.read();
                    if (finished) return;
                    if (part.done) {
                        finished = true;
                        await emit({ phase: "result_media_upstream_body_complete" });
                        reader.releaseLock();
                        controller.close();
                    } else {
                        bytes += part.value.byteLength;
                        if (firstByteMs < 0) firstByteMs = Date.now() - started;
                        controller.enqueue(part.value);
                    }
                } catch (error) {
                    if (finished) return;
                    finished = true;
                    const cause = error instanceof Error ? (error.cause as { code?: string } | undefined) : undefined;
                    await emit({ phase: "result_media_upstream_body_failed", errorName: error instanceof Error ? error.name : "Error", errorCode: cause?.code || (error as { code?: string })?.code });
                    reader.releaseLock();
                    controller.error(error);
                }
            },
            async cancel(reason) {
                if (finished) return;
                finished = true;
                try {
                    await reader.cancel(reason);
                } finally {
                    reader.releaseLock();
                    await emit({ phase: "result_media_upstream_body_canceled" });
                }
            },
        },
        { highWaterMark: 0 },
    );
    return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}
