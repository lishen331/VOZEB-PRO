import { describe, expect, it } from "vitest";

import { selectedImageResolution } from "@/components/creative-generation-preferences";
import type { CreativeGenerationPreferences } from "@/lib/creative-runtime-contract";
import { canvasImagePreferenceSummary } from "./canvas-image-settings-popover";

function preferences(image: NonNullable<CreativeGenerationPreferences["image"]>): CreativeGenerationPreferences {
    return { mode: "image", image };
}

describe("selectedImageResolution", () => {
    it("shows the explicitly picked 清晰度 independently of 画质", () => {
        expect(selectedImageResolution({ quality: "high", resolution: "1k" })).toBe("1k");
        expect(selectedImageResolution({ quality: "low", resolution: "4k" })).toBe("4k");
    });

    it("falls back to the quality-derived tier when 清晰度 was never picked", () => {
        expect(selectedImageResolution({ quality: "medium" })).toBe("2k");
        expect(selectedImageResolution({ quality: "high" })).toBe("4k");
        expect(selectedImageResolution({ quality: "low" })).toBe("1k");
        expect(selectedImageResolution({ quality: "auto" })).toBe("2k");
    });

    it("treats legacy low/medium/high resolution values as never picked", () => {
        expect(selectedImageResolution({ quality: "high", resolution: "low" })).toBe("4k");
    });
});

describe("canvasImagePreferenceSummary", () => {
    it("shows the explicitly picked 清晰度 next to a different 画质", () => {
        const summary = canvasImagePreferenceSummary(preferences({ size: "1024x1024", quality: "high", resolution: "1k", background: "auto", count: 1 }));

        expect(summary).toContain("高");
        expect(summary).toContain("1K");
        expect(summary).not.toContain("4K");
    });

    it("derives the tier from 画质 when 清晰度 was never picked", () => {
        const summary = canvasImagePreferenceSummary(preferences({ size: "auto", quality: "high", resolution: "low", background: "auto", count: 1 }));

        expect(summary).toContain("4K");
    });

    it("keeps quality, resolution and count after a custom pixel size", () => {
        const summary = canvasImagePreferenceSummary(preferences({ size: "1536x1024", quality: "high", resolution: "4k", background: "auto", count: 2 }));

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
