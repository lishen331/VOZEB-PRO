import { describe, expect, it } from "vitest";

import { UploadMediaValidationError, validateUploadBytes } from "./upload-media-validation";

// 最小但真实的 magic-byte 头，取值经 file-type v22 实测确认。
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]), Buffer.from("IHDR"), Buffer.alloc(20)]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0, 0, 0, 0]), Buffer.from("WEBPVP8 ")]);
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypmp42"), Buffer.alloc(40)]);
const MP3 = Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(64)]);
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const TEXT = Buffer.from("hello this is plain text, not an image at all");

describe("validateUploadBytes", () => {
    it("rejects an SVG uploaded as an image (no magic bytes → sniff fails)", async () => {
        await expect(validateUploadBytes(SVG, "image")).rejects.toBeInstanceOf(UploadMediaValidationError);
    });

    it("rejects plain text declared as an image", async () => {
        await expect(validateUploadBytes(TEXT, "image")).rejects.toBeInstanceOf(UploadMediaValidationError);
    });

    it("accepts a real PNG and returns the sniffed mime", async () => {
        await expect(validateUploadBytes(PNG, "image")).resolves.toEqual({ mimeType: "image/png" });
    });

    it("accepts real WebP, MP4 and MP3 by their real bytes", async () => {
        await expect(validateUploadBytes(WEBP, "image")).resolves.toEqual({ mimeType: "image/webp" });
        await expect(validateUploadBytes(MP4, "video")).resolves.toEqual({ mimeType: "video/mp4" });
        await expect(validateUploadBytes(MP3, "audio")).resolves.toEqual({ mimeType: "audio/mpeg" });
    });

    it("corrects a JPEG declared as image/png to image/jpeg rather than rejecting it", async () => {
        // 内容本身合法，只是声明错了：以嗅探结果为准存为 jpeg（→ .jpg），不拒绝。
        await expect(validateUploadBytes(JPEG, "image")).resolves.toEqual({ mimeType: "image/jpeg" });
    });

    it("rejects a real image when the expected category is audio (prefix mismatch)", async () => {
        await expect(validateUploadBytes(PNG, "audio")).rejects.toBeInstanceOf(UploadMediaValidationError);
    });
});
