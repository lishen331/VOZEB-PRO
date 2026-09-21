import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.stubGlobal("fetch", mocks.fetch);
import { uploadBindingVerificationReference } from "./binding-verification-reference-upload";
describe("binding verification reference upload", () => {
    beforeEach(() => mocks.fetch.mockReset());
    it("uses the object-storage upstream URL instead of the application URL", async () => {
        mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ url: "/api/reference-assets/permanent/a.png", upstreamUrl: "https://oss.example/a.png", storage: "object" }), { status: 200, headers: { "content-type": "application/json" } }));
        const file = new File(["png"], "a.png", { type: "image/png" });
        await expect(uploadBindingVerificationReference(file, "image")).resolves.toEqual({ type: "image", url: "https://oss.example/a.png", previewUrl: "/api/reference-assets/permanent/a.png" });
        const form = mocks.fetch.mock.calls[0][1].body as FormData;
        expect(form.get("persistent")).toBe("true");
        expect(form.get("type")).toBe("image");
    });
    it("rejects local-only upload results before starting provider generation", async () => {
        mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ url: "/api/reference-assets/permanent/a.png", storage: "local" }), { status: 200, headers: { "content-type": "application/json" } }));
        await expect(uploadBindingVerificationReference(new File(["x"], "a.png", { type: "image/png" }), "image")).rejects.toThrow("OSS");
    });
});
