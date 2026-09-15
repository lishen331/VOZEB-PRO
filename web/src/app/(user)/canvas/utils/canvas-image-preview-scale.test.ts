import { describe, expect, it } from "vitest";

import { CANVAS_MAX_ZOOM, canvasImagePreviewWidthForTier, canvasImageZoomTier } from "./canvas-image-preview-scale";

describe("canvasImageZoomTier", () => {
    it("clamps every scale at or below 1 to tier 1", () => {
        expect(canvasImageZoomTier(0.05)).toBe(1);
        expect(canvasImageZoomTier(0.5)).toBe(1);
        expect(canvasImageZoomTier(1)).toBe(1);
    });

    it("holds tier 1 across the whole 1x band", () => {
        expect(canvasImageZoomTier(1.1)).toBe(1);
        expect(canvasImageZoomTier(1.43)).toBe(1);
        expect(canvasImageZoomTier(1.999)).toBe(1);
    });

    it("steps to the next tier only on a power-of-two boundary", () => {
        expect(canvasImageZoomTier(2)).toBe(2);
        expect(canvasImageZoomTier(3.9)).toBe(2);
        expect(canvasImageZoomTier(4)).toBe(4);
    });

    it("caps at the maximum canvas zoom", () => {
        expect(canvasImageZoomTier(CANVAS_MAX_ZOOM)).toBe(4);
        expect(canvasImageZoomTier(50)).toBe(4);
    });

    it("falls back to tier 1 for non-finite input", () => {
        expect(canvasImageZoomTier(Number.NaN)).toBe(1);
        expect(canvasImageZoomTier(Number.POSITIVE_INFINITY)).toBe(1);
    });

    it("never decreases as the scale grows", () => {
        let previous = 0;
        for (let k = 0.05; k <= CANVAS_MAX_ZOOM; k += 0.05) {
            const tier = canvasImageZoomTier(k);
            expect(tier).toBeGreaterThanOrEqual(previous);
            previous = tier;
        }
    });
});

describe("canvasImagePreviewWidthForTier", () => {
    it("returns a bucketed width for a default image node at tier 1", () => {
        expect(canvasImagePreviewWidthForTier(320, 1)).toBe(320);
    });

    it("keeps one width across the entire 1x zoom band", () => {
        const band = [1, 1.1, 1.43, 1.999].map((k) => canvasImagePreviewWidthForTier(320, canvasImageZoomTier(k)));
        expect(new Set(band).size).toBe(1);
    });

    it("never requests more pixels than the source image has", () => {
        expect(canvasImagePreviewWidthForTier(320, 4, 1024)).toBe(1024);
        expect(canvasImagePreviewWidthForTier(320, 4, 1200)).toBe(1200);
    });

    it("does not let bucket rounding overshoot a non-bucket source width", () => {
        // normalizeImagePreviewWidth(1024) rounds up to 1280; the source is
        // only 1024 wide, so the final width must stay at 1024.
        expect(canvasImagePreviewWidthForTier(320, 4, 1024)).toBeLessThanOrEqual(1024);
    });

    it("still buckets normally when the source width is unknown", () => {
        expect(canvasImagePreviewWidthForTier(320, 2)).toBe(640);
    });

    it("treats an invalid tier as tier 1", () => {
        expect(canvasImagePreviewWidthForTier(320, 0)).toBe(320);
        expect(canvasImagePreviewWidthForTier(320, Number.NaN)).toBe(320);
    });

    it("swaps the width at most once across a 13-notch wheel sweep", () => {
        // handleWheel uses factor = 1.1 ** (-deltaY/100); one wheel notch is 1.1x.
        const widths: number[] = [];
        let k = 1;
        for (let notch = 0; notch < 13; notch += 1) {
            widths.push(canvasImagePreviewWidthForTier(320, canvasImageZoomTier(k)));
            k = Math.min(CANVAS_MAX_ZOOM, k * 1.1);
        }
        const swaps = widths.filter((width, index) => index > 0 && width !== widths[index - 1]).length;
        expect(swaps).toBeLessThanOrEqual(1);
    });
});
