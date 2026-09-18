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
