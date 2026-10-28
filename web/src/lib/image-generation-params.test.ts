import { describe, expect, it } from "vitest";

import { imagePixelTier, imageResolutionFromRequestValue, imageTaskPointMultiplier, normalizeImageResolution, requestedImageResolution, upstreamImageQuality } from "./image-generation-params";

describe("upstreamImageQuality", () => {
    it("passes quality through for gpt-image models", () => {
        expect(upstreamImageQuality({ model: "gpt-image-2", quality: "high" })).toBe("high");
        expect(upstreamImageQuality({ model: "gpt-image-2.5-sunburst", quality: "low" })).toBe("low");
    });

    it("drops quality for models that have no quality parameter", () => {
        expect(upstreamImageQuality({ model: "doubao-seedream-4-5-251128", quality: "high" })).toBeUndefined();
        expect(upstreamImageQuality({ model: "gemini-3-pro-image-preview", quality: "high" })).toBeUndefined();
        expect(upstreamImageQuality({ model: "gpt-image-2-all", quality: "high" })).toBeUndefined();
    });

    it("drops auto and unknown values", () => {
        expect(upstreamImageQuality({ model: "gpt-image-2", quality: "auto" })).toBeUndefined();
        expect(upstreamImageQuality({ model: "gpt-image-2", quality: "1024x1024" })).toBeUndefined();
    });
});

describe("requestedImageResolution", () => {
    it("keeps 清晰度 independent of 画质", () => {
        expect(requestedImageResolution({ model: "gpt-image-2", quality: "high", resolution: "1k" })).toBe("1k");
        expect(requestedImageResolution({ model: "gpt-image-2", quality: "low", resolution: "4k" })).toBe("4k");
    });

    it("derives from 画质 when 清晰度 was never picked (legacy callers)", () => {
        expect(requestedImageResolution({ model: "gpt-image-2", quality: "medium" })).toBe("2k");
        expect(requestedImageResolution({ model: "gpt-image-2", quality: "high" })).toBe("4k");
        expect(requestedImageResolution({ model: "gpt-image-2", quality: "auto" })).toBeUndefined();
    });

    it("ignores the pre-decoupling low/medium/high resolution values stored on old nodes", () => {
        expect(requestedImageResolution({ model: "gpt-image-2", quality: "high", resolution: "low" })).toBe("4k");
        expect(normalizeImageResolution("medium")).toBeUndefined();
    });

    it("pins 1K-only models to 1k", () => {
        expect(requestedImageResolution({ model: "gpt-image-2-1k", resolution: "4k" })).toBe("1k");
        expect(requestedImageResolution({ model: "gpt-image-1.5", resolution: "2k" })).toBe("1k");
    });

    it("lifts Seedream 4.5 / 5.0 lite above their 3.7MP minimum", () => {
        expect(requestedImageResolution({ model: "doubao-seedream-4-5-251128", resolution: "1k" })).toBe("2k");
        expect(requestedImageResolution({ model: "doubao-seedream-5-0-260128", quality: "low" })).toBe("2k");
    });

    it("maps to the pixel tier used by resolveSize", () => {
        expect(imagePixelTier({ model: "gpt-image-2", quality: "high", resolution: "1k" })).toBe("low");
        expect(imagePixelTier({ model: "gpt-image-2", quality: "auto" })).toBeUndefined();
    });
});

describe("imageResolutionFromRequestValue", () => {
    it("reads tier strings and pixel sizes", () => {
        expect(imageResolutionFromRequestValue("2K")).toBe("2k");
        expect(imageResolutionFromRequestValue("1024x1024")).toBe("1k");
        expect(imageResolutionFromRequestValue("2720x1536")).toBe("2k");
        expect(imageResolutionFromRequestValue("3840x2160")).toBe("4k");
        expect(imageResolutionFromRequestValue("16:9")).toBeUndefined();
    });
});

describe("imageTaskPointMultiplier", () => {
    const multipliers = { imageQuality: { auto: 1, low: 1, medium: 1, high: 2 }, imageResolution: { auto: 1, "1k": 1, "2k": 1.5, "4k": 3 } };

    it("multiplies 画质 by 清晰度", () => {
        expect(imageTaskPointMultiplier({ model: "gpt-image-2", quality: "high", resolution: "1k", size: "1:1" }, multipliers)).toBe(2);
        expect(imageTaskPointMultiplier({ model: "gpt-image-2", quality: "high", resolution: "4k", size: "1:1" }, multipliers)).toBe(6);
    });

    it("bills explicit pixel sizes by their pixel count", () => {
        expect(imageTaskPointMultiplier({ model: "gpt-image-2", quality: "low", size: "3840x2160" }, multipliers)).toBe(3);
    });

    it("does not charge 画质 that is never sent upstream", () => {
        expect(imageTaskPointMultiplier({ model: "doubao-seedream-5-0-260128", quality: "high", resolution: "2k", size: "1:1" }, multipliers)).toBe(1.5);
    });

    it("treats missing resolution multipliers as 1", () => {
        expect(imageTaskPointMultiplier({ model: "gpt-image-2", quality: "high", resolution: "4k" }, { imageQuality: { high: 2 } })).toBe(2);
    });
});
