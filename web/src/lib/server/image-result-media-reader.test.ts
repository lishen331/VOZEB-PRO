import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";

const mocks = vi.hoisted(() => ({ external: vi.fn(), internal: vi.fn() }));
vi.mock("@/lib/server/safe-outbound-fetch", () => ({ fetchSafeOutbound: mocks.external }));
vi.mock("@/lib/server/internal-origin", () => ({ fetchInternalApi: mocks.internal }));
import { readImageResultMedia } from "./image-result-media-reader";

const origin = "https://platform.example";
const value = "https://cdn.example/private/result.png?signature=do-not-log";
const setup = async () => {
    const bytes = await sharp({ create: { width: 2, height: 3, channels: 3, background: "blue" } })
        .png()
        .toBuffer();
    return { bytes, emit: vi.fn(async () => {}) };
};
beforeEach(() => vi.resetAllMocks());

describe("canvas result media delivery", () => {
    it("reads real image bytes and records headers, body, dimensions without URL secrets", async () => {
        const { bytes, emit } = await setup();
        mocks.external.mockResolvedValue(new Response(bytes, { headers: { "content-type": "application/octet-stream", "content-length": String(bytes.length) } }));
        const result = await readImageResultMedia({ value, origin, authContext: "session=private", emit });
        expect(result).toMatchObject({ dataUrl: expect.stringMatching(/^data:image\/png;base64,/), width: 2, height: 3 });
        expect(mocks.external.mock.calls[0][1].headers.get("cookie")).toBeNull();
        expect(emit).toHaveBeenCalledWith(expect.objectContaining({ phase: "result_media_complete", responseBytes: bytes.length, width: 2, height: 3 }));
        const serialized = JSON.stringify(emit.mock.calls);
        expect(serialized).toContain("cdn.example");
        expect(serialized).not.toMatch(/signature|do-not-log|private\/result|session=private/);
    });
    it("retains media HTTP status instead of only reporting a generic proxy read error", async () => {
        const { emit } = await setup();
        mocks.external.mockResolvedValue(new Response("Forbidden", { status: 403 }));
        await expect(readImageResultMedia({ value, origin, emit })).rejects.toMatchObject({ name: "ImageResultMediaReadError", stage: "headers", status: 403, code: "media_http_error" });
        expect(emit).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "result_media_failed", status: 403, stage: "headers" }));
        expect(mocks.external).toHaveBeenCalledTimes(1);
    });
    it("rejects HTTP200 HTML rather than trusting the status or MIME", async () => {
        mocks.external.mockResolvedValue(new Response("<html>not an image</html>", { headers: { "content-type": "image/png" } }));
        await expect(readImageResultMedia({ value, origin })).rejects.toMatchObject({ stage: "decode", code: "media_invalid_image" });
    });
    it("rejects truncated bodies whose declared length is larger", async () => {
        const { bytes } = await setup();
        mocks.external.mockResolvedValue(new Response(bytes, { headers: { "content-length": String(bytes.length + 10) } }));
        await expect(readImageResultMedia({ value, origin })).rejects.toMatchObject({ stage: "body", code: "media_truncated" });
    });
    it("rejects corrupt pixel payload even if an image header is readable", async () => {
        const { bytes } = await setup();
        const corrupt = Buffer.from(bytes);
        const idat = corrupt.indexOf("IDAT");
        corrupt.fill(0, idat + 4, corrupt.length - 12);
        mocks.external.mockResolvedValue(new Response(corrupt));
        await expect(readImageResultMedia({ value, origin })).rejects.toMatchObject({ stage: "decode", code: "media_invalid_image" });
    });
    it("uses the authenticated internal proxy without leaking its claim to a CDN", async () => {
        const { bytes, emit } = await setup();
        mocks.internal.mockResolvedValue(new Response(bytes));
        await readImageResultMedia({ value: "/api/ai/system/channel/_media?url=encoded", origin, authContext: "session=private", internalHeaders: { "x-vozeb-pro-media-authorization": "claim" }, emit });
        const headers = mocks.internal.mock.calls[0][1].headers;
        expect(headers.get("cookie")).toBe("session=private");
        expect(headers.get("x-vozeb-pro-media-authorization")).toBe("claim");
        expect(mocks.external).not.toHaveBeenCalled();
    });
    it("validates inline data without making a network request", async () => {
        const { bytes } = await setup();
        await expect(readImageResultMedia({ value: `data:image/png;base64,${bytes.toString("base64")}`, origin })).resolves.toMatchObject({ width: 2, height: 3 });
        expect(mocks.external).not.toHaveBeenCalled();
    });
    it("rejects a fake inline image before asset registration", async () => {
        await expect(readImageResultMedia({ value: "data:image/png;base64,aHRtbA==", origin })).rejects.toMatchObject({ stage: "decode", code: "media_invalid_image" });
    });
    it("records transport failure and preserves its cause without resubmitting generation", async () => {
        const error = new Error("network disconnected", { cause: { code: "ECONNRESET" } });
        mocks.external.mockRejectedValue(error);
        await expect(readImageResultMedia({ value, origin })).rejects.toMatchObject({ stage: "connect", cause: error, code: "media_transport_error" });
        expect(mocks.external).toHaveBeenCalledTimes(1);
    });
    it("cancels oversized streams before reading the full response", async () => {
        const cancel = vi.fn();
        const response = new Response(
            new ReadableStream({
                start(c) {
                    c.enqueue(new Uint8Array(1));
                },
                cancel,
            }),
            { headers: { "content-length": String(100 * 1024 * 1024) } },
        );
        mocks.external.mockResolvedValue(response);
        await expect(readImageResultMedia({ value, origin })).rejects.toMatchObject({ code: "media_too_large" });
        expect(cancel).toHaveBeenCalled();
    });
    it("does not turn diagnostic persistence failure into a generation failure", async () => {
        const { bytes } = await setup();
        mocks.external.mockResolvedValue(new Response(bytes));
        await expect(
            readImageResultMedia({
                value,
                origin,
                emit: async () => {
                    throw new Error("db unavailable");
                },
            }),
        ).resolves.toMatchObject({ width: 2 });
    });
});
