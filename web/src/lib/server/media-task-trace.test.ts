import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ persist: vi.fn(async () => undefined) }));
vi.mock("./media-task-diagnostic-store", () => ({ persistMediaDiagnostic: mocks.persist }));
import { diagnosticNodeId, currentMediaTraceHeaders, observeMediaFetch, withMediaDiagnosticScope } from "./media-task-trace";
const task = { id: "task-1", userId: "user-1", surface: "canvas", config: { channelId: "channel-1", model: "model-1" } };
beforeEach(() => mocks.persist.mockClear());

describe("media trace does not change generation semantics", () => {
    it.each(["image", "video"] as const)("records %s HTTP failures without consuming the original body", async (type) => {
        const response = new Response(JSON.stringify({ error: { message: "denied Bearer sensitive" } }), { status: 403, headers: { "content-type": "application/json", "x-request-id": "provider-1" } });
        const fetcher = vi.fn(async () => response);
        const result = await withMediaDiagnosticScope(type, task, "submit", () =>
            observeMediaFetch("https://example.test/images", { method: "POST", headers: { authorization: "Bearer sensitive" }, body: JSON.stringify({ prompt: "private", model: "m", size: "1024x1024" }) }, fetcher),
        );
        expect(result).toBe(response);
        expect(await result.json()).toEqual({ error: { message: "denied Bearer sensitive" } });
        expect(fetcher).toHaveBeenCalledTimes(1);
        const events = mocks.persist.mock.calls.map((call) => (call as unknown as [unknown, Record<string, unknown>])[1]);
        expect(events).toContainEqual(expect.objectContaining({ phase: "transport_response", status: 403, requestId: "provider-1" }));
        expect(JSON.stringify(events)).not.toMatch(/sensitive|private/);
    });
    it("keeps original timeout and its cause and never retries", async () => {
        const error = new Error("fetch failed", { cause: { code: "UND_ERR_HEADERS_TIMEOUT", message: "headers timeout" } });
        const fetcher = vi.fn(async () => {
            throw error;
        });
        await expect(withMediaDiagnosticScope("image", task, "submit", () => observeMediaFetch("https://example.test/images", { method: "POST" }, fetcher))).rejects.toBe(error);
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(JSON.stringify(mocks.persist.mock.calls)).toContain("UND_ERR_HEADERS_TIMEOUT");
    });
    it("does not instrument other business surfaces", async () => {
        await withMediaDiagnosticScope("video", { ...task, surface: "drama-lab" }, "submit", async () => 1);
        expect(mocks.persist).not.toHaveBeenCalled();
    });
    it("isolates parallel tasks and only attaches trace IDs to internal system proxy calls", async () => {
        await Promise.all(
            ["first", "second"].map((id) =>
                withMediaDiagnosticScope("image", { ...task, id }, "submit", async () => {
                    await Promise.resolve();
                    expect(new Headers(currentMediaTraceHeaders("http://localhost/api/ai/system/channel/images")).get("x-vozeb-media-trace-id")).toBe(id);
                    expect(currentMediaTraceHeaders("https://example.test/images")).toBeUndefined();
                }),
            ),
        );
    });
    it("does not read successful image/base64 bodies", async () => {
        const response = new Response("base64-image-content", { headers: { "content-type": "application/json" } });
        const clone = vi.spyOn(response, "clone");
        await withMediaDiagnosticScope("image", task, "submit", () => observeMediaFetch("https://example.test/images", { method: "POST" }, async () => response));
        expect(clone).not.toHaveBeenCalled();
        expect(response.bodyUsed).toBe(false);
    });
});

it("associates nodes with existing client request identities without changing requests", () => {
    expect(diagnosticNodeId({ projectId: "canvas-p", clientRequestId: "canvas-image:canvas-p:image-node:nonce" })).toBe("image-node");
    expect(diagnosticNodeId({ projectId: "canvas-p", clientRequestId: "canvas-video-retry:canvas-p:video-node:nonce" })).toBe("video-node");
    expect(diagnosticNodeId({ projectId: "other", clientRequestId: "canvas-image:canvas-p:image-node:nonce" })).toBeUndefined();
});
