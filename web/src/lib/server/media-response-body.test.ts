import { describe, it, expect } from "vitest";
import { readObservedResponseBody } from "./media-response-body";

describe("response body evidence", () => {
    it("preserves exact bytes and records completed body", async () => {
        const events: Record<string, unknown>[] = [];
        const bytes = new TextEncoder().encode("图像-response");
        const result = await readObservedResponseBody(new Response(bytes), (e) => {
            events.push(e);
        });
        expect(new Uint8Array(result)).toEqual(bytes);
        expect(events.at(-1)).toMatchObject({ phase: "upstream_body_complete", responseBytes: bytes.length });
    });
    it("records partial bytes and original failure without retries", async () => {
        let reads = 0;
        const error = new Error("socket terminated", { cause: { code: "UND_ERR_SOCKET" } });
        const events: Record<string, unknown>[] = [];
        const response = new Response(
            new ReadableStream({
                pull(controller) {
                    reads++;
                    if (reads === 1) controller.enqueue(new Uint8Array([1, 2, 3]));
                    else controller.error(error);
                },
            }),
        );
        await expect(
            readObservedResponseBody(response, (e) => {
                events.push(e);
            }),
        ).rejects.toBe(error);
        expect(events.at(-1)).toMatchObject({ phase: "upstream_body_exception", responseBytes: 3, errorMessage: "socket terminated", errorCode: "UND_ERR_SOCKET" });
    });
    it("distinguishes no body bytes from partial data", async () => {
        const events: Record<string, unknown>[] = [];
        const response = new Response(
            new ReadableStream({
                start(c) {
                    c.error(new DOMException("timed out", "TimeoutError"));
                },
            }),
        );
        await expect(
            readObservedResponseBody(response, (e) => {
                events.push(e);
            }),
        ).rejects.toThrow();
        expect(events.at(-1)).toMatchObject({ responseBytes: 0, errorName: "TimeoutError", firstByteMs: -1 });
    });
    it("diagnostic failure cannot fail a successful body", async () => {
        const result = await readObservedResponseBody(new Response("ok"), () => {
            throw new Error("logger failed");
        });
        expect(new TextDecoder().decode(result)).toBe("ok");
    });
});

it("retains progress when a partial body stalls until transport abort", async () => {
    const events: Record<string, unknown>[] = [];
    const signal = new AbortController();
    let stream!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(
        new ReadableStream<Uint8Array>({
            start(c) {
                stream = c;
                c.enqueue(new Uint8Array([1, 2]));
            },
        }),
    );
    const result = readObservedResponseBody(
        response,
        (e) => {
            events.push(e);
        },
        signal.signal,
    );
    const failure = expect(result).rejects.toMatchObject({ name: "TimeoutError" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    signal.abort(new DOMException("request deadline", "TimeoutError"));
    stream.error(signal.signal.reason);
    await failure;
    expect(events.at(-1)).toMatchObject({ responseBytes: 2, state: "request_signal_aborted", errorName: "TimeoutError" });
});
