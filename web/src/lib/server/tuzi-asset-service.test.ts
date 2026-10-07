import { beforeEach, describe, expect, it, vi } from "vitest";

import { clearTuziAssetCacheForTests, ingestTuziReferences } from "./tuzi-asset-service";

// Minimal 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const DATA_URL = `data:image/png;base64,${PNG.toString("base64")}`;

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function tuziFetcher(statuses: string[], overrides: Record<string, Response> = {}) {
    const calls: string[] = [];
    let polls = 0;
    const fetcher = vi.fn(async (input: string, init?: RequestInit) => {
        const path = new URL(input).pathname;
        calls.push(`${init?.method || "GET"} ${path}`);
        if (overrides[path]) return overrides[path];
        if (path === "/v1/seedance/assets") return json({ success: true, data: { id: "asset01", status: "pending", compliance_started: false } });
        if (path.endsWith("/compliance")) return json({ success: true, data: { id: "asset01", status: "pending", compliance_started: true, review_task_id: "r1" } });
        const status = statuses[Math.min(polls++, statuses.length - 1)];
        return json({ success: true, data: { id: "asset01", status, reference: status === "active" ? "asset://asset01" : undefined, error_message: status === "failed" ? "人像不合规" : undefined } });
    });
    return { fetcher, calls };
}

const options = (fetcher: ReturnType<typeof tuziFetcher>["fetcher"]) => ({ baseUrl: "https://api.tu-zi.com/v1/", apiKey: "k", cacheScope: "ch1", fetcher, pollIntervalMs: 0 });

describe("ingestTuziReferences", () => {
    beforeEach(() => clearTuziAssetCacheForTests());

    it("uploads, starts compliance once and polls until active", async () => {
        const { fetcher, calls } = tuziFetcher(["pending", "active"]);
        const result = await ingestTuziReferences([{ type: "image", url: DATA_URL, role: "first_frame" }], options(fetcher));
        expect(result).toEqual([{ type: "image", url: "asset://asset01", role: "first_frame" }]);
        expect(calls).toEqual(["POST /v1/seedance/assets", "POST /v1/seedance/assets/asset01/compliance", "GET /v1/seedance/assets/asset01", "GET /v1/seedance/assets/asset01"]);
    });

    it("reuses the cached reference for the same image bytes", async () => {
        const { fetcher, calls } = tuziFetcher(["active"]);
        await ingestTuziReferences([{ type: "image", url: DATA_URL }], options(fetcher));
        const result = await ingestTuziReferences([{ type: "image", url: DATA_URL }], options(fetcher));
        expect(result[0].url).toBe("asset://asset01");
        expect(calls.filter((call) => call === "POST /v1/seedance/assets")).toHaveLength(1);
    });

    it("falls back to the original URL when success is false", async () => {
        const { fetcher } = tuziFetcher(["active"], { "/v1/seedance/assets": json({ success: false, message: "当前令牌未配置可用素材适配器" }) });
        const onFallback = vi.fn();
        const result = await ingestTuziReferences([{ type: "image", url: DATA_URL }], options(fetcher), onFallback);
        expect(result[0].url).toBe(DATA_URL);
        expect(String(onFallback.mock.calls[0][0])).toContain("当前令牌未配置可用素材适配器");
    });

    it("falls back when compliance fails", async () => {
        const { fetcher } = tuziFetcher(["failed"]);
        const onFallback = vi.fn();
        const result = await ingestTuziReferences([{ type: "image", url: DATA_URL }], options(fetcher), onFallback);
        expect(result[0].url).toBe(DATA_URL);
        expect(String(onFallback.mock.calls[0][0])).toContain("人像不合规");
    });

    it("passes video, audio and existing asset references through untouched", async () => {
        const { fetcher } = tuziFetcher(["active"]);
        const references = [
            { type: "image" as const, url: "asset://already1" },
            { type: "video" as const, url: "https://x/v.mp4" },
            { type: "audio" as const, url: "https://x/a.mp3" },
        ];
        expect(await ingestTuziReferences(references, options(fetcher))).toEqual(references);
        expect(fetcher).not.toHaveBeenCalled();
    });
});
