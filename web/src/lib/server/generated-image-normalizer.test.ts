import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { normalizeGeneratedImageBytes } from "./generated-image-normalizer";

describe("generated image normalization", () => {
    it("preserves upstream bytes and dimensions instead of cropping to requested dimensions", async () => {
        const source = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#7c8da5" } })
            .png()
            .toBuffer();
        const result = await normalizeGeneratedImageBytes(source, "image/png", "1824x1024");

        expect(result).toMatchObject({ mimeType: "image/png", width: 1600, height: 900 });
        expect(result.bytes).toEqual(source);
    });

    it("does not resample the original even when an exact smaller size was requested", async () => {
        const source = await sharp({ create: { width: 672, height: 1008, channels: 3, background: "#9a6b4f" } })
            .png()
            .toBuffer();
        const result = await normalizeGeneratedImageBytes(source, "image/png", "400x600");

        expect(result).toMatchObject({ mimeType: "image/png", width: 672, height: 1008 });
        expect(result.bytes).toEqual(source);
    });

    it("keeps the upstream file unchanged when no exact target is configured", async () => {
        const source = await sharp({ create: { width: 1280, height: 720, channels: 3, background: "#506070" } })
            .jpeg({ quality: 92 })
            .toBuffer();
        const result = await normalizeGeneratedImageBytes(source, "image/jpeg", "16:9");

        expect(result).toMatchObject({ mimeType: "image/jpeg", width: 1280, height: 720 });
        expect(result.bytes).toEqual(source);
    });

    it("keeps a large exact upstream image instead of applying a platform edge ceiling", async () => {
        const source = await sharp({ create: { width: 1600, height: 900, channels: 3, background: "#203040" } })
            .webp()
            .toBuffer();
        const result = await normalizeGeneratedImageBytes(source, "image/webp", "4096x2304");

        expect(result).toMatchObject({ width: 1600, height: 900 });
        expect(result.bytes).toEqual(source);
    });

    it.each([
        [1536, 1024, "1824x1024"],
        [2172, 724, "1824x1024"],
        [1024, 1024, "576x1024"],
    ] as const)("keeps every pixel of %sx%s for requested %s", async (width, height, target) => {
        const source = await sharp({ create: { width, height, channels: 3, background: "#a23b62" } })
            .png()
            .toBuffer();
        const result = await normalizeGeneratedImageBytes(source, "image/png", target);
        expect(result).toMatchObject({ width, height });
        expect(result.bytes).toEqual(source);
    });
});
