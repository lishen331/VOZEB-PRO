import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    fetchSafeOutbound: vi.fn(),
    getObjectStorageRuntimeConfig: vi.fn(),
    getObjectBytes: vi.fn(),
    putObjectBytes: vi.fn(),
}));

vi.mock("@/lib/server/safe-outbound-fetch", () => ({ fetchSafeOutbound: mocks.fetchSafeOutbound }));
vi.mock("@/lib/server/object-storage-config", () => ({ getObjectStorageRuntimeConfig: mocks.getObjectStorageRuntimeConfig }));
vi.mock("@/lib/server/object-storage-client", () => ({
    getObjectBytes: mocks.getObjectBytes,
    putObjectBytes: mocks.putObjectBytes,
    isMissingObjectError: (error: { name?: string }) => error?.name === "NoSuchKey",
    objectStorageErrorMessage: (error: unknown) => String(error),
}));
vi.mock("@/lib/server/media-image-variant-cache", () => ({
    getOrCreateCachedImageVariant: vi.fn(async (_key: string, factory: () => Promise<Buffer>) => factory()),
}));

import { createPublicPromptImage, createUnavailablePublicPromptImage, normalizePublicPromptImagePath } from "./public-prompt-image";

const COMMIT = "60e9c65baecfd6d6d51ac4e4d87f146af834bb64";
const OSS_CONFIG = { enabled: true, prefix: "vozeb-pro", bucket: "b", accessKeyId: "a", secretAccessKey: "s" };

function sourceJpeg() {
    return sharp({ create: { width: 800, height: 400, channels: 3, background: "#365f8d" } })
        .jpeg()
        .toBuffer();
}

function githubResponse(source: Buffer) {
    return new Response(new Uint8Array(source), { headers: { "content-type": "image/jpeg", "content-length": String(source.byteLength) } });
}

describe("public prompt images", () => {
    beforeEach(() => {
        mocks.getObjectStorageRuntimeConfig.mockResolvedValue({ enabled: false, prefix: "vozeb-pro" });
    });

    afterEach(() => {
        mocks.fetchSafeOutbound.mockReset();
        mocks.getObjectStorageRuntimeConfig.mockReset();
        mocks.getObjectBytes.mockReset();
        mocks.putObjectBytes.mockReset();
        vi.unstubAllGlobals();
    });

    it("only accepts image paths inside a known upstream case directory", () => {
        expect(normalizePublicPromptImagePath("images/portrait_case1/output.jpg")).toBe("images/portrait_case1/output.jpg");
        expect(normalizePublicPromptImagePath("images/portrait_case323/323391.jpeg")).toBe("images/portrait_case323/323391.jpeg");
        expect(normalizePublicPromptImagePath("../LICENSE")).toBe("");
        expect(normalizePublicPromptImagePath("images/portrait_case1/../../LICENSE")).toBe("");
    });

    it("returns a bounded WebP variant", async () => {
        const source = await sharp({ create: { width: 800, height: 400, channels: 3, background: "#365f8d" } })
            .jpeg()
            .toBuffer();
        mocks.fetchSafeOutbound.mockResolvedValue(new Response(new Uint8Array(source), { headers: { "content-type": "image/jpeg", "content-length": String(source.byteLength) } }));

        const output = await createPublicPromptImage("images/portrait_case11/output.jpg", "320");
        expect(mocks.fetchSafeOutbound).toHaveBeenCalledOnce();
        expect(output).not.toBeNull();
        if (!output) throw new Error("Expected a generated WebP image");
        await expect(sharp(output).metadata()).resolves.toMatchObject({ format: "webp", width: 320, height: 160 });
    });

    it("rejects oversized upstream responses before decoding", async () => {
        mocks.fetchSafeOutbound.mockResolvedValue(new Response(new Uint8Array([1]), { headers: { "content-type": "image/jpeg", "content-length": String(25 * 1024 * 1024) } }));
        await expect(createPublicPromptImage("images/portrait_case12/output.jpg", "640")).rejects.toThrow("超过大小限制");
    });

    it("creates a valid uncached fallback image when the upstream source is unavailable", async () => {
        const fallback = await createUnavailablePublicPromptImage("320");

        await expect(sharp(fallback).metadata()).resolves.toMatchObject({ format: "webp", width: 320, height: 180 });
    });

    it("serves the original image from object storage without contacting GitHub", async () => {
        mocks.getObjectStorageRuntimeConfig.mockResolvedValue(OSS_CONFIG);
        mocks.getObjectBytes.mockResolvedValue(await sourceJpeg());

        const output = await createPublicPromptImage("images/poster_case107/output.jpg", "320");

        expect(mocks.getObjectBytes).toHaveBeenCalledWith(OSS_CONFIG, `vozeb-pro/prompt-images/${COMMIT}/images/poster_case107/output.jpg`);
        expect(mocks.fetchSafeOutbound).not.toHaveBeenCalled();
        expect(mocks.putObjectBytes).not.toHaveBeenCalled();
        await expect(sharp(output!).metadata()).resolves.toMatchObject({ format: "webp", width: 320 });
    });

    it("fetches GitHub and stores the original bytes when the object is missing", async () => {
        const source = await sourceJpeg();
        mocks.getObjectStorageRuntimeConfig.mockResolvedValue(OSS_CONFIG);
        mocks.getObjectBytes.mockRejectedValue(Object.assign(new Error("missing"), { name: "NoSuchKey" }));
        mocks.fetchSafeOutbound.mockResolvedValue(githubResponse(source));

        await expect(createPublicPromptImage("images/poster_case109/output.jpg", "320")).resolves.not.toBeNull();

        expect(mocks.putObjectBytes).toHaveBeenCalledWith(OSS_CONFIG, { key: `vozeb-pro/prompt-images/${COMMIT}/images/poster_case109/output.jpg`, bytes: source, contentType: "image/jpeg" });
    });

    it("falls back to GitHub without writing when object storage reads fail", async () => {
        mocks.getObjectStorageRuntimeConfig.mockResolvedValue(OSS_CONFIG);
        mocks.getObjectBytes.mockRejectedValue(Object.assign(new Error("denied"), { name: "AccessDenied" }));
        mocks.fetchSafeOutbound.mockResolvedValue(githubResponse(await sourceJpeg()));

        await expect(createPublicPromptImage("images/poster_case110/output.jpg", "320")).resolves.not.toBeNull();

        expect(mocks.fetchSafeOutbound).toHaveBeenCalledOnce();
        expect(mocks.putObjectBytes).not.toHaveBeenCalled();
    });

    it("still returns the image when the object storage write fails", async () => {
        mocks.getObjectStorageRuntimeConfig.mockResolvedValue(OSS_CONFIG);
        mocks.getObjectBytes.mockRejectedValue(Object.assign(new Error("missing"), { name: "NoSuchKey" }));
        mocks.putObjectBytes.mockRejectedValue(new Error("write failed"));
        mocks.fetchSafeOutbound.mockResolvedValue(githubResponse(await sourceJpeg()));

        const output = await createPublicPromptImage("images/poster_case111/output.jpg", "320");

        await expect(sharp(output!).metadata()).resolves.toMatchObject({ format: "webp", width: 320 });
    });

    it("does not touch object storage when it is disabled", async () => {
        mocks.fetchSafeOutbound.mockResolvedValue(githubResponse(await sourceJpeg()));

        await expect(createPublicPromptImage("images/poster_case112/output.jpg", "320")).resolves.not.toBeNull();

        expect(mocks.getObjectBytes).not.toHaveBeenCalled();
        expect(mocks.putObjectBytes).not.toHaveBeenCalled();
    });
});
