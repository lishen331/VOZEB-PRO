import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ persist: vi.fn(async () => undefined) }));
vi.mock("./media-task-diagnostic-store", () => ({ persistMediaDiagnostic: mocks.persist }));
import { diagnosticNodeId, currentMediaTraceHeaders, observeMediaFetch, recordMediaTaskEvent, traceMediaException, withMediaDiagnosticScope } from "./media-task-trace";
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

describe("program error stacks", () => {
    function overflow(depth = 0): number {
        return overflow(depth + 1) + 1;
    }
    function persistedEvents() {
        return mocks.persist.mock.calls.map((call) => (call as unknown as [unknown, Record<string, unknown>])[1]);
    }

    it("logs and persists the stack of a RangeError inside a task scope", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        await expect(withMediaDiagnosticScope("image", task, "provider", async () => overflow())).rejects.toBeInstanceOf(RangeError);
        const line = log.mock.calls.find((call) => call[0] === "[media-stack]");
        expect(line?.slice(1, 4)).toEqual(["provider_exception", "image", "task-1"]);
        expect(String(line?.[4])).toContain("overflow");
        const event = persistedEvents().find((item) => item.phase === "provider_exception");
        expect(event?.errorName).toBe("RangeError");
        expect(String(event?.stack)).toContain("overflow");
        log.mockRestore();
    });

    it("logs the stack even without a diagnostic context", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        await traceMediaException(new TypeError("x is not a function"));
        expect(log.mock.calls.find((call) => call[0] === "[media-stack]")?.slice(1, 4)).toEqual(["exception", "-", "-"]);
        expect(mocks.persist).not.toHaveBeenCalled();
        log.mockRestore();
    });

    it("does not log stacks for ordinary business errors", async () => {
        const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
        await expect(
            withMediaDiagnosticScope("image", task, "provider", async () => {
                throw new Error("上游拒绝");
            }),
        ).rejects.toThrow("上游拒绝");
        expect(log.mock.calls.some((call) => call[0] === "[media-stack]")).toBe(false);
        expect(persistedEvents().find((item) => item.phase === "provider_exception")?.stack).toBeUndefined();
        log.mockRestore();
    });

    it("keeps at least 60 stack frames", () => {
        expect(Error.stackTraceLimit).toBeGreaterThanOrEqual(60);
    });
});

it("associates nodes with existing client request identities without changing requests", () => {
    expect(diagnosticNodeId({ projectId: "canvas-p", clientRequestId: "canvas-image:canvas-p:image-node:nonce" })).toBe("image-node");
    expect(diagnosticNodeId({ projectId: "canvas-p", clientRequestId: "canvas-video-retry:canvas-p:video-node:nonce" })).toBe("video-node");
    expect(diagnosticNodeId({ projectId: "other", clientRequestId: "canvas-image:canvas-p:image-node:nonce" })).toBeUndefined();
});

it("captures actual proxy byte-buffer parameters and gateway request IDs", async () => {
    const body = new TextEncoder().encode(JSON.stringify({ model: "gpt-image-2", prompt: "do-not-log", size: "1024x1024" })).buffer;
    await withMediaDiagnosticScope("image", task, "submit", () => observeMediaFetch("https://gateway.example/v1/images/generations", { method: "POST", body }, async () => new Response("{}", { headers: { "x-oneapi-request-id": "gateway-123" } })));
    const events = JSON.stringify(mocks.persist.mock.calls);
    expect(events).toContain("1024x1024");
    expect(events).toContain("gateway-123");
    expect(events).not.toContain("do-not-log");
});

describe("result diagnostic identity", () => {
    it("records historical source-only Canvas results with canonical diagnostic context", async () => {
        await recordMediaTaskEvent("image", { ...task, surface: undefined, source: "canvas" }, { phase: "result_persist_complete" });
        expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ taskId: "task-1", userId: "user-1", surface: "canvas" }), expect.objectContaining({ phase: "result_persist_complete" }));
    });
    it.each([
        { surface: undefined, source: "image-workbench" },
        { surface: "drama", source: "canvas" },
    ])("does not instrument non-Canvas result identity %j", async (identity) => {
        await recordMediaTaskEvent("image", { ...task, ...identity }, { phase: "result_persist_complete" });
        expect(mocks.persist).not.toHaveBeenCalled();
    });
});
