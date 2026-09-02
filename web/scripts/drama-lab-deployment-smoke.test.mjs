import { describe, expect, it, vi } from "vitest";

import { normalizeOrigin, runDramaLabDeploymentSmoke } from "./drama-lab-deployment-smoke.mjs";

describe("Short Drama Lab deployment smoke", () => {
    it("checks the live contract without creating a task", async () => {
        const fetcher = vi.fn(async (url) => {
            expect(url).toBe("http://127.0.0.1:3002/api/health/live");
            return new Response(JSON.stringify({ code: 0, data: { status: "live" } }), { status: 200 });
        });

        const result = await runDramaLabDeploymentSmoke({ origin: "127.0.0.1:3002", fetcher, retries: 0 });

        expect(result.live.status).toBe(200);
        expect(result.ready).toEqual({ skipped: true });
        expect(fetcher).toHaveBeenCalledOnce();
        expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "GET", cache: "no-store" });
    });

    it("optionally requires a healthy generation worker", async () => {
        const fetcher = vi.fn(async (url) => {
            const pathname = new URL(url).pathname;
            if (pathname.endsWith("/live")) return new Response(JSON.stringify({ code: 0, data: { status: "live" } }), { status: 200 });
            return new Response(JSON.stringify({ code: 0, data: { ready: true, generationWorker: { healthy: true } } }), { status: 200 });
        });

        const result = await runDramaLabDeploymentSmoke({ origin: "https://staging.example.test/base", fetcher, requireReady: true, retries: 0 });

        expect(result.ready.payload.data.ready).toBe(true);
        expect(fetcher).toHaveBeenCalledTimes(2);
    });

    it("fails closed on malformed live responses and unsafe origins", async () => {
        const fetcher = vi.fn(async () => new Response("not-json", { status: 200 }));
        await expect(runDramaLabDeploymentSmoke({ origin: "http://localhost:3000", fetcher, retries: 0 })).rejects.toThrow("Live health contract failed");
        expect(() => normalizeOrigin("https://user:pass@example.test")).toThrow("credentials");
        expect(() => normalizeOrigin("https://example.test/path?token=secret")).toThrow("query");
    });

    it("retries transient transport and server errors", async () => {
        const fetcher = vi
            .fn()
            .mockRejectedValueOnce(new Error("connection reset"))
            .mockResolvedValueOnce(new Response(JSON.stringify({ code: 0, data: { status: "live" } }), { status: 200 }));
        const sleep = vi.fn(async () => undefined);

        await runDramaLabDeploymentSmoke({ origin: "http://localhost:3000", fetcher, retries: 1, sleep });

        expect(fetcher).toHaveBeenCalledTimes(2);
        expect(sleep).toHaveBeenCalledOnce();
    });
});
