import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { composeOutpainting, prepareOutpainting, supportsOutpainting } from "./practice-outpainting-service";

const geometry = { width: 5, height: 3, sourceWidth: 2, sourceHeight: 2, left: 1, top: 1 };
const source = () =>
    sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } })
        .png()
        .toBuffer();

describe("practice outpainting pixels", () => {
    it("uses an opaque center and a transparent perimeter, then restores source RGBA over the generated result", async () => {
        const original = await source();
        const encoded = (data: Buffer) => `data:image/png;base64,${data.toString("base64")}`;
        const input = await prepareOutpainting(encoded(original), geometry);
        const mask = await sharp(Buffer.from(input.mask.split(",")[1], "base64"))
            .ensureAlpha()
            .raw()
            .toBuffer();
        expect(mask[3]).toBe(0);
        expect(mask[(5 + 1) * 4 + 3]).toBe(255);
        const generated = await sharp({ create: { width: 5, height: 3, channels: 4, background: "blue" } })
            .png()
            .toBuffer();
        const output = await composeOutpainting(encoded(original), encoded(generated), geometry);
        const pixels = await sharp(Buffer.from(output.split(",")[1], "base64"))
            .ensureAlpha()
            .raw()
            .toBuffer();
        expect([...pixels.subarray(0, 4)]).toEqual([0, 0, 255, 255]);
        expect([...pixels.subarray(24, 28)]).toEqual([255, 0, 0, 128]);
        await expect(composeOutpainting(encoded(original), encoded(original), geometry)).rejects.toThrow("尺寸");
    });
    it("only selects the native multipart edit contract", () => {
        const config = { apiFormat: "openai", model: "image-fixture", advancedConfig: { protocol: "openai", editPath: "/images/edits", supportsReferenceImage: true } } as const;
        expect(supportsOutpainting(config)).toBe(true);
        expect(supportsOutpainting({ ...config, advancedConfig: { ...config.advancedConfig, referenceRule: "JSON" } })).toBe(false);
        expect(supportsOutpainting({ ...config, advancedConfig: { ...config.advancedConfig, editPath: "/images/generations" } })).toBe(false);
    });
});
