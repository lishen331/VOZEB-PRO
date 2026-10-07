import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), writePersistent: vi.fn(), writeTemporary: vi.fn(), createSigned: vi.fn(), getRegistration: vi.fn(), externalUrl: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/reference-asset-store", () => ({ writePersistentMediaDataUrl: mocks.writePersistent, writeReferenceMediaDataUrl: mocks.writeTemporary }));
vi.mock("@/lib/server/reference-asset-access", () => ({ createSignedReferenceAssetUrl: mocks.createSigned }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistration: mocks.getRegistration }));
vi.mock("@/lib/server/object-storage-service", () => ({ createExternalMediaReadUrl: mocks.externalUrl }));
import { POST } from "./route";
describe("reference upload OSS upstream URL", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "u" });
        mocks.writePersistent.mockResolvedValue({ token: "permanent/a.png", bytes: 3, mimeType: "image/png", storage: "object" });
        mocks.getRegistration.mockResolvedValue({ storageProvider: "object" });
        mocks.externalUrl.mockResolvedValue("https://oss.example/a.png");
    });
    it("returns an object-storage URL for providers", async () => {
        const form = new FormData();
        form.append("type", "image");
        form.append("persistent", "true");
        // A2 起上传以字节嗅探为准、不再采信声明的 MIME，夹具必须是能被识别的真图片。
        // 注意：file-type 只看 8 字节 magic 会返回 undefined，必须带完整 IHDR 块。
        form.append("file", new File([pngBytes()], "a.png", { type: "image/png" }));
        const response = await POST(new Request("https://app.example/api/reference-assets", { method: "POST", body: form }));
        await expect(response.json()).resolves.toMatchObject({ storage: "object", upstreamUrl: "https://oss.example/a.png" });
    });
});

// 最小可识别的 1x1 PNG（magic + IHDR 块头）。合成值，不含任何真实业务数据。
function pngBytes() {
    return new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137]);
}
