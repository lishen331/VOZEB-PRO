import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getObjectStorageRuntimeConfig: vi.fn(),
    signObjectRead: vi.fn(),
}));

vi.mock("@/lib/server/object-storage-config", () => ({ getObjectStorageRuntimeConfig: mocks.getObjectStorageRuntimeConfig }));
vi.mock("@/lib/server/object-storage-client", () => ({ signObjectRead: mocks.signObjectRead, objectStorageErrorMessage: (error: unknown) => String(error) }));

import { GET } from "./route";

const request = new Request("http://localhost/api/public/qwen-voice-previews/x");
const call = (file: string) => GET(request, { params: Promise.resolve({ file }) });

describe("GET /api/public/qwen-voice-previews/[file]", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getObjectStorageRuntimeConfig.mockResolvedValue({ enabled: true, prefix: "vozeb-pro" });
        mocks.signObjectRead.mockResolvedValue("https://oss.example.com/signed");
    });

    it("redirects a catalog preview to a signed object storage URL", async () => {
        const response = await call("longcanzhuyue.wav");
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("https://oss.example.com/signed");
        expect(mocks.signObjectRead).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ key: "vozeb-pro/qwen-voice-previews/longcanzhuyue.wav" }));
    });

    it("rejects files that are not in the catalog without touching storage", async () => {
        for (const file of ["../secret.wav", "longbailanlan.wav", "longcanzhuyue.mp3"]) expect((await call(file)).status).toBe(404);
        expect(mocks.getObjectStorageRuntimeConfig).not.toHaveBeenCalled();
    });

    it("returns 404 when object storage is disabled", async () => {
        mocks.getObjectStorageRuntimeConfig.mockResolvedValue({ enabled: false, prefix: "vozeb-pro" });
        expect((await call("longcanzhuyue.wav")).status).toBe(404);
        expect(mocks.signObjectRead).not.toHaveBeenCalled();
    });

    it("returns an uncached 502 when signing fails", async () => {
        mocks.signObjectRead.mockRejectedValue(new Error("credentials"));
        const response = await call("longcanzhuyue.wav");
        expect(response.status).toBe(502);
        expect(response.headers.get("cache-control")).toBe("no-store");
    });
});
