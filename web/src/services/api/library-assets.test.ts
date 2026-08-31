import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    uploadImage: vi.fn(),
}));

vi.mock("@/services/image-storage", () => ({ uploadImage: mocks.uploadImage }));

import { uploadLibraryImageAsset } from "./library-assets";

describe("uploadLibraryImageAsset", () => {
    beforeEach(() => {
        mocks.uploadImage.mockReset();
        mocks.uploadImage.mockResolvedValue({
            url: "/api/reference-assets/permanent/2026/08/27/images/cover.png",
            storageKey: "permanent/2026/08/27/images/cover.png",
            width: 1200,
            height: 630,
            bytes: 2048,
            mimeType: "image/png",
        });
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 0, data: { asset: { id: "asset-cover" } } }), { status: 200 })));
    });

    it("stores a local image as a permanent library asset with stable media metadata", async () => {
        const file = new File(["cover"], "cover.png", { type: "image/png" });

        await expect(uploadLibraryImageAsset(file)).resolves.toEqual({ id: "asset-cover" });
        expect(mocks.uploadImage).toHaveBeenCalledWith(file);
        const request = vi.mocked(fetch).mock.calls[0]?.[1];
        expect(JSON.parse(String(request?.body))).toMatchObject({
            kind: "image",
            title: "cover.png",
            coverUrl: "/api/reference-assets/permanent/2026/08/27/images/cover.png",
            data: {
                dataUrl: "/api/reference-assets/permanent/2026/08/27/images/cover.png",
                storageKey: "permanent/2026/08/27/images/cover.png",
                serverUrl: "/api/reference-assets/permanent/2026/08/27/images/cover.png",
                width: 1200,
                height: 630,
            },
        });
        expect(String(request?.body)).not.toContain("blob:");
    });
});
