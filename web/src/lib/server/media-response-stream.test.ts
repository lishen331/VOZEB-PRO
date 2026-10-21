import { expect, it, vi } from "vitest";
import { observeMediaResponseStream } from "./media-response-body";
it("does not read ahead and cancels the original body with observed byte count", async () => {
    const pull = vi.fn((c: ReadableStreamDefaultController<Uint8Array>) => c.enqueue(new Uint8Array([1, 2, 3])));
    const cancel = vi.fn();
    const record = vi.fn();
    const source = new Response(new ReadableStream({ pull, cancel }, { highWaterMark: 0 }));
    const result = observeMediaResponseStream(source, record);
    await Promise.resolve();
    expect(pull).not.toHaveBeenCalled();
    const reader = result.body!.getReader();
    await reader.read();
    expect(pull).toHaveBeenCalledTimes(1);
    await reader.cancel("consumer stopped");
    expect(cancel).toHaveBeenCalledWith("consumer stopped");
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ phase: "result_media_upstream_body_canceled", responseBytes: 3 }));
});
it("keeps successful bytes and response metadata even if diagnostics fail", async () => {
    const result = observeMediaResponseStream(new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: { "content-range": "bytes 0-2/10" } }), async () => {
        throw new Error("db unavailable");
    });
    expect(result.status).toBe(206);
    expect(result.headers.get("content-range")).toBe("bytes 0-2/10");
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
});
it("preserves the original read error and safe cause code without recording raw error text", async () => {
    const broken = new Error("https://private.example/result?signature=secret", { cause: { code: "ECONNRESET" } });
    const record = vi.fn();
    const result = observeMediaResponseStream(
        new Response(
            new ReadableStream({
                pull(c) {
                    c.error(broken);
                },
            }),
        ),
        record,
    );
    await expect(result.arrayBuffer()).rejects.toBe(broken);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ phase: "result_media_upstream_body_failed", errorCode: "ECONNRESET", responseBytes: 0 }));
    expect(JSON.stringify(record.mock.calls)).not.toContain("secret");
});
