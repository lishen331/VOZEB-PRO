import { afterEach, describe, expect, it, vi } from "vitest";
import { canvasReadableImageUrl } from "./browser-media-url";

describe("origin-clean canvas image sources", () => {
    afterEach(() => vi.unstubAllGlobals());
    it("requests same-origin bytes for managed assets rather than OSS redirects", () => {
        vi.stubGlobal("window", { location: { origin: "https://app.example" } });
        expect(canvasReadableImageUrl("/api/generation-log-assets/image.png?width=1920")).toBe("/api/generation-log-assets/image.png?width=1920&render=canvas");
        expect(canvasReadableImageUrl("https://app.example/api/reference-assets/image.png")).toBe("/api/reference-assets/image.png?render=canvas");
    });
    it("proxies external images and keeps blob and data URLs unchanged", () => {
        vi.stubGlobal("window", { location: { origin: "https://app.example" } });
        expect(canvasReadableImageUrl("https://cdn.example/image.png")).toBe("/api/media-proxy?url=https%3A%2F%2Fcdn.example%2Fimage.png");
        expect(canvasReadableImageUrl("blob:https://app.example/image")).toBe("blob:https://app.example/image");
        expect(canvasReadableImageUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
    });
});
