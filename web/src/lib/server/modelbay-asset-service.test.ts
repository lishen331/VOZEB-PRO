import { describe, expect, it, vi } from "vitest";

import { ingestModelBayAsset, ingestModelBayReferences, isModelBayAssetReference, modelBayAssetUrl, modelBayAssetsBaseUrl, ModelBayAssetError } from "./modelbay-asset-service";

function response(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("ModelBay asset service", () => {
    it("normalizes the official assets endpoint and asset references", () => {
        expect(modelBayAssetsBaseUrl("https://api.modelbay.io")).toBe("https://api.modelbay.io/doubao/api/v3");
        expect(modelBayAssetsBaseUrl("https://api.modelbay.io/doubao/api/v3/")).toBe("https://api.modelbay.io/doubao/api/v3");
        expect(modelBayAssetUrl("asset-20260922105122-gqskk")).toBe("asset://asset-20260922105122-gqskk");
        expect(isModelBayAssetReference("asset://asset-20260922105122-gqskk")).toBe(true);
        expect(isModelBayAssetReference("https://cdn.example.com/person.jpg")).toBe(false);
    });

    it("ingests a source and polls pending until active", async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(response({ id: "task-1", asset_id: "asset-1", status: "pending" }))
            .mockResolvedValueOnce(response({ id: "task-1", asset_id: "asset-1", status: "active" }));
        await expect(ingestModelBayAsset({ url: "https://cdn.example.com/person.jpg", type: "image", label: "person" }, { baseUrl: "https://api.modelbay.io", apiKey: "secret", fetcher, pollAttempts: 2, pollIntervalMs: 0 })).resolves.toMatchObject({
            taskId: "task-1",
            assetId: "asset-1",
            status: "active",
            type: "image",
        });
        expect(fetcher.mock.calls.map(([url, init]) => [url, (init as RequestInit).method])).toEqual([
            ["https://api.modelbay.io/doubao/api/v3/assets", "POST"],
            ["https://api.modelbay.io/doubao/api/v3/assets/task-1", "GET"],
        ]);
        expect(((fetcher.mock.calls[0]?.[1] as RequestInit).headers as Headers).get("Authorization")).toBe("Bearer secret");
    });

    it("deduplicates repeated references and preserves roles", async () => {
        const fetcher = vi.fn().mockResolvedValue(response({ id: "task-1", asset_id: "asset-1", status: "active" }));
        const result = await ingestModelBayReferences(
            [
                { type: "image", role: "reference", url: "https://cdn.example.com/person.jpg" },
                { type: "image", role: "reference", url: "https://cdn.example.com/person.jpg" },
                { type: "image", role: "first_frame", url: "asset://existing" },
            ],
            { baseUrl: "https://api.modelbay.io", apiKey: "secret", fetcher },
        );
        expect(result).toEqual([
            { type: "image", role: "reference", url: "asset://asset-1" },
            { type: "image", role: "reference", url: "asset://asset-1" },
            { type: "image", role: "first_frame", url: "asset://existing" },
        ]);
        expect(fetcher).toHaveBeenCalledTimes(1);
    });

    it("returns actionable errors for failed assets and malformed active responses", async () => {
        const failed = vi.fn().mockResolvedValue(response({ id: "task-1", status: "failed", error: { code: "asset_format_unsupported", message: "bad media" } }));
        await expect(ingestModelBayAsset({ url: "https://cdn.example.com/person.jpg", type: "image" }, { baseUrl: "https://api.modelbay.io", apiKey: "secret", fetcher: failed })).rejects.toMatchObject({
            name: "ModelBayAssetError",
            details: { code: "asset_format_unsupported" },
        });
        const missingAssetId = vi.fn().mockResolvedValue(response({ id: "task-1", status: "active" }));
        await expect(ingestModelBayAsset({ url: "https://cdn.example.com/person.jpg", type: "image" }, { baseUrl: "https://api.modelbay.io", apiKey: "secret", fetcher: missingAssetId })).rejects.toBeInstanceOf(ModelBayAssetError);
    });

    it("does not accept private or non-http source URLs", async () => {
        await expect(ingestModelBayAsset({ url: "/api/reference-assets/person.jpg", type: "image" }, { baseUrl: "https://api.modelbay.io", apiKey: "secret", fetcher: vi.fn() })).rejects.toThrow("公网 HTTP(S) URL");
        await expect(ingestModelBayAsset({ url: "data:image/png;base64,abc", type: "image" }, { baseUrl: "https://api.modelbay.io", apiKey: "secret", fetcher: vi.fn() })).rejects.toThrow("公网 HTTP(S) URL");
    });
});
