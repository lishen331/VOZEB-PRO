import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    createPublicPromptImage: vi.fn(),
    createUnavailablePublicPromptImage: vi.fn(),
}));

vi.mock("@/lib/server/public-prompt-image", () => ({
    createPublicPromptImage: mocks.createPublicPromptImage,
    createUnavailablePublicPromptImage: mocks.createUnavailablePublicPromptImage,
}));

import { GET } from "./route";

describe("GET /api/public/prompt-images", () => {
    it("returns an uncached WebP fallback when the upstream image is temporarily unavailable", async () => {
        mocks.createPublicPromptImage.mockRejectedValueOnce(new Error("network unavailable"));
        mocks.createUnavailablePublicPromptImage.mockResolvedValueOnce(Buffer.from("fallback"));

        const response = await GET(new Request("http://localhost/api/public/prompt-images?path=images%2Fportrait_case1%2Foutput.jpg&width=320"));

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/webp");
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from("fallback"));
    });
});
