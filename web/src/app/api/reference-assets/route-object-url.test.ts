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
        form.append("file", new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" }));
        const response = await POST(new Request("https://app.example/api/reference-assets", { method: "POST", body: form }));
        await expect(response.json()).resolves.toMatchObject({ storage: "object", upstreamUrl: "https://oss.example/a.png" });
    });
});
