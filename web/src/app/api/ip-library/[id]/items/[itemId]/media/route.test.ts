import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), previewIpMediaForUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-download-service", () => ({ previewIpMediaForUser: mocks.previewIpMediaForUser }));

import { GET } from "./route";

describe("GET /api/ip-library/:id/items/:itemId/media", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.previewIpMediaForUser.mockResolvedValue({ kind: "response", response: new Response("image", { headers: { "Content-Type": "image/png" } }), fileName: "主角.png" });
    });

    it("streams an authorized item inline with private caching", async () => {
        const request = new Request("http://localhost/api/ip-library/ip-one/items/item-one/media?subIpId=child-one");
        const response = await GET(request, { params: Promise.resolve({ id: "ip-one", itemId: "item-one" }) });

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(response.headers.get("cache-control")).toContain("no-store");
        expect(mocks.previewIpMediaForUser).toHaveBeenCalledWith("user-one", request, "ip-one", { itemId: "item-one", subIpId: "child-one" });
    });

    it("preserves a short-lived object storage redirect", async () => {
        mocks.previewIpMediaForUser.mockResolvedValue({ kind: "redirect", url: "https://objects.example/signed", fileName: "主角.png" });
        const response = await GET(new Request("http://localhost/api/ip-library/ip-one/items/item-one/media"), { params: Promise.resolve({ id: "ip-one", itemId: "item-one" }) });

        expect(response.status).toBe(307);
        expect(response.headers.get("location")).toBe("https://objects.example/signed");
    });
});
