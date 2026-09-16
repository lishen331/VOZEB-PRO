import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { imageToDataUrl } from "./image-storage";

describe("image data url reads", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        fetchMock.mockReset();
        vi.stubGlobal("fetch", fetchMock);
        vi.stubGlobal("window", { location: { origin: "https://app.example" } });
        vi.stubGlobal(
            "FileReader",
            class {
                result: string | null = null;
                onload: (() => void) | null = null;
                onerror: (() => void) | null = null;

                readAsDataURL(blob: Blob) {
                    this.result = `data:${blob.type};base64,eA==`;
                    this.onload?.();
                }
            },
        );
    });

    afterEach(() => vi.unstubAllGlobals());

    it.each([
        ["reference", "/api/reference-assets/permanent/2026/07/27/images/a.png"],
        ["generation", "/api/generation-log-assets/permanent/2026/07/27/images/a.png"],
    ])("reads managed %s images as same-origin bytes instead of a storage redirect", async (_scope, url) => {
        fetchMock.mockResolvedValue(new Response("x", { headers: { "Content-Type": "image/png" } }));

        await expect(imageToDataUrl({ serverUrl: url })).resolves.toBe("data:image/png;base64,eA==");
        expect(fetchMock.mock.calls[0]?.[0]).toBe(`${url}?render=canvas`);
    });

    it("normalizes a managed url down to its storage path before reading bytes", async () => {
        fetchMock.mockResolvedValue(new Response("x", { headers: { "Content-Type": "image/png" } }));

        await imageToDataUrl({ serverUrl: "/api/reference-assets/permanent/2026/07/27/images/a.png?width=256" });
        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/reference-assets/permanent/2026/07/27/images/a.png?render=canvas");
    });

    it("proxies a remote image rather than fetching it cross-origin", async () => {
        fetchMock.mockResolvedValue(new Response("x", { headers: { "Content-Type": "image/png" } }));

        await imageToDataUrl({ remoteUrl: "https://cdn.example/image.png" });
        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/media-proxy?url=https%3A%2F%2Fcdn.example%2Fimage.png");
    });

    it("returns an inline data url without a network read", async () => {
        await expect(imageToDataUrl({ dataUrl: "data:image/png;base64,abc" })).resolves.toBe("data:image/png;base64,abc");
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
