import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getCurrentUser: vi.fn(), downloadIpForUser: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/ip-library-download-service", () => ({ downloadIpForUser: mocks.downloadIpForUser }));

import { POST } from "./route";

describe("POST /api/ip-library/:id/download", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.downloadIpForUser.mockResolvedValue({ kind: "file", bytes: Buffer.from("story"), mimeType: "text/markdown; charset=utf-8", fileName: "故事.md", downloadId: "download-one" });
    });

    it("rejects null and malformed JSON bodies as 400", async () => {
        const response = await POST(new Request("http://localhost/api/ip-library/ip-one/download", { method: "POST", body: "null", headers: { "Content-Type": "application/json" } }), { params: Promise.resolve({ id: "ip-one" }) });
        expect(response.status).toBe(400);
        expect(mocks.downloadIpForUser).not.toHaveBeenCalled();
    });

    it("returns an original file response and does not expose a source URL", async () => {
        const response = await POST(
            new Request("http://localhost/api/ip-library/ip-one/download", { method: "POST", body: JSON.stringify({ versionId: "version-one", itemIds: ["item-one"], package: false }), headers: { "Content-Type": "application/json" } }),
            { params: Promise.resolve({ id: "ip-one" }) },
        );
        expect(response.status).toBe(200);
        expect(response.headers.get("content-disposition")).toContain("%E6%95%85%E4%BA%8B.md");
        expect(await response.text()).toBe("story");
        expect(mocks.downloadIpForUser).toHaveBeenCalledWith("user-one", expect.any(Request), "ip-one", { versionId: "version-one", itemIds: ["item-one"], package: false });
    });

    it("maps unauthorized item access to 403 and never writes a success payload", async () => {
        mocks.downloadIpForUser.mockRejectedValue(Object.assign(new Error("IP 内容项不存在或不属于当前版本"), { status: 403 }));
        const response = await POST(new Request("http://localhost/api/ip-library/ip-one/download", { method: "POST", body: JSON.stringify({ itemIds: ["other-school-item"], package: false }), headers: { "Content-Type": "application/json" } }), {
            params: Promise.resolve({ id: "ip-one" }),
        });
        expect(response.status).toBe(403);
        expect(await response.json()).toMatchObject({ code: 403, data: null });
    });

    it("redirects object storage downloads without persisting the signed URL", async () => {
        mocks.downloadIpForUser.mockResolvedValue({ kind: "redirect", url: "https://objects.example/short-lived", fileName: "角色.png", downloadId: "download-two" });
        const response = await POST(new Request("http://localhost/api/ip-library/ip-one/download", { method: "POST", body: JSON.stringify({ itemIds: ["item-one"], package: false }), headers: { "Content-Type": "application/json" } }), {
            params: Promise.resolve({ id: "ip-one" }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { url: "https://objects.example/short-lived", fileName: "角色.png", downloadId: "download-two" } });
    });
});
