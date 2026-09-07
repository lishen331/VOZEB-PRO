import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ response: vi.fn(), asset: vi.fn() }));
vi.mock("@/lib/server/local-media-response", () => ({ createLocalMediaResponse: mocks.response }));
vi.mock("@/lib/server/login-page-media", () => ({ loginPageMediaFile: mocks.asset }));

import { GET } from "./route";

describe("GET /api/login-page-media/[fileName]", () => {
    it("rejects unknown paths and serves configured media publicly", async () => {
        mocks.asset.mockReturnValueOnce(null);
        expect((await GET(new Request("http://localhost/api/login-page-media/nope.exe"), { params: Promise.resolve({ fileName: "nope.exe" }) })).status).toBe(404);
        mocks.asset.mockReturnValue({ filePath: "C:/data/hero.mp4", mimeType: "video/mp4" });
        mocks.response.mockResolvedValue(new Response("video", { headers: { "Content-Type": "video/mp4" } }));
        const response = await GET(new Request("http://localhost/api/login-page-media/hero.mp4"), { params: Promise.resolve({ fileName: "hero.mp4" }) });
        expect(response.headers.get("Content-Type")).toBe("video/mp4");
        expect(mocks.response).toHaveBeenCalledWith(expect.any(Request), "C:/data/hero.mp4", "video/mp4", expect.objectContaining({ "Cache-Control": "public, max-age=300" }));
    });
});
