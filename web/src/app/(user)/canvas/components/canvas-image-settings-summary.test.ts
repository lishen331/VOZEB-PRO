import { describe, expect, it } from "vitest";

import { imageResolutionFromQuality } from "@/components/creative-generation-preferences";
import type { CreativeGenerationPreferences } from "@/lib/creative-runtime-contract";
import { canvasImagePreferenceSummary } from "./canvas-image-settings-popover";

function preferences(image: NonNullable<CreativeGenerationPreferences["image"]>): CreativeGenerationPreferences {
    return { mode: "image", image };
}

describe("imageResolutionFromQuality", () => {
    it("maps 标准 quality to the 2K tier upstream actually honours", () => {
        expect(imageResolutionFromQuality("medium")).toBe("medium");
    });

    it("maps high and low quality to their own tiers", () => {
        expect(imageResolutionFromQuality("high")).toBe("high");
        expect(imageResolutionFromQuality("low")).toBe("low");
    });

    it("treats auto as the 2K default rather than falling to 1K", () => {
        expect(imageResolutionFromQuality("auto")).toBe("medium");
    });

    it("falls back to 2K for unknown, empty and legacy label values", () => {
        expect(imageResolutionFromQuality("")).toBe("medium");
        expect(imageResolutionFromQuality(undefined)).toBe("medium");
        expect(imageResolutionFromQuality("2K")).toBe("medium");
        expect(imageResolutionFromQuality("1024x1024")).toBe("medium");
    });

    it("ignores casing and surrounding whitespace", () => {
        expect(imageResolutionFromQuality("  HIGH  ")).toBe("high");
    });
});

describe("canvasImagePreferenceSummary", () => {
    it("shows 2K when quality is 标准 so the summary never contradicts the panel", () => {
        const summary = canvasImagePreferenceSummary(preferences({ size: "1024x1024", quality: "medium", resolution: "low", background: "auto", count: 1 }));

        expect(summary).toContain("标准");
        expect(summary).toContain("2K");
        expect(summary).not.toContain("1K");
    });

    it("ignores a stale resolution field entirely", () => {
        const summary = canvasImagePreferenceSummary(preferences({ size: "auto", quality: "high", resolution: "low", background: "auto", count: 1 }));

        expect(summary).toContain("4K");
    });

    it("keeps quality, resolution and count after a custom pixel size", () => {
        const summary = canvasImagePreferenceSummary(preferences({ size: "1536x1024", quality: "high", resolution: "high", background: "auto", count: 2 }));

        // compactSizeLabel renders the dimension separator as a multiplication sign.
        expect(summary).toContain("1536×1024");
        expect(summary).toContain("高");
        expect(summary).toContain("4K");
        expect(summary).toContain("2张");
    });

    it("appends the transparent background marker", () => {
        expect(canvasImagePreferenceSummary(preferences({ size: "auto", quality: "medium", resolution: "medium", background: "transparent", count: 1 }))).toContain("透明");
    });

    it("omits the count segment for a single image", () => {
        expect(canvasImagePreferenceSummary(preferences({ size: "auto", quality: "medium", resolution: "medium", background: "auto", count: 1 }))).not.toContain("1张");
    });

    it("prefers a fixed size label when one is supplied", () => {
        const summary = canvasImagePreferenceSummary(preferences({ size: "auto", quality: "medium", resolution: "medium", background: "auto", count: 1 }), "全景 2:1");

        expect(summary).toContain("全景 2:1");
        expect(summary).toContain("2K");
    });
});
