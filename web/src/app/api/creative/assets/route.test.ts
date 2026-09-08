import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCurrentUser: vi.fn(),
    uploadAssetForUser: vi.fn(),
    referenceAssetForUser: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/server/creative-runtime-service", () => ({
    CreativeRuntimeServiceError: class CreativeRuntimeServiceError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    },
    uploadAssetForUser: mocks.uploadAssetForUser,
    referenceAssetForUser: mocks.referenceAssetForUser,
}));

import { POST } from "./route";

describe("POST /api/creative/assets", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getCurrentUser.mockResolvedValue({ id: "user-one" });
        mocks.uploadAssetForUser.mockResolvedValue({ id: "asset-one", type: "audio" });
        mocks.referenceAssetForUser.mockResolvedValue({ id: "asset-reference", type: "image" });
    });

    it("requires authentication", async () => {
        mocks.getCurrentUser.mockResolvedValue(null);
        const response = await POST(request("conversation-one", new File(["audio"], "voice.mp3", { type: "audio/mpeg" })));

        expect(response.status).toBe(401);
        expect(mocks.uploadAssetForUser).not.toHaveBeenCalled();
    });

    it("passes a multipart media file to the owned conversation", async () => {
        const file = new File(["audio"], "voice.mp3", { type: "audio/mpeg" });
        const response = await POST(request("conversation-one", file));

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { asset: { id: "asset-one" } } });
        expect(mocks.uploadAssetForUser).toHaveBeenCalledWith("user-one", "conversation-one", expect.objectContaining({ name: "voice.mp3", type: "audio/mpeg" }));
    });

    it("rejects a missing conversation before calling the service", async () => {
        const response = await POST(request("", new File(["video"], "clip.mp4", { type: "video/mp4" })));

        expect(response.status).toBe(400);
        expect(mocks.uploadAssetForUser).not.toHaveBeenCalled();
    });

    it("imports an owned server media reference without asking the browser to fetch OSS", async () => {
        const response = await POST(
            new Request("http://localhost/api/creative/assets", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ conversationId: "conversation-one", sourceUrl: "/api/generation-log-assets/permanent/source.png", title: "商品主图" }),
            }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ code: 0, data: { asset: { id: "asset-reference" } } });
        expect(mocks.referenceAssetForUser).toHaveBeenCalledWith("user-one", "conversation-one", {
            sourceUrl: "/api/generation-log-assets/permanent/source.png",
            title: "商品主图",
        });
        expect(mocks.uploadAssetForUser).not.toHaveBeenCalled();
    });

    it("rejects an oversized JSON reference request before parsing it", async () => {
        const response = await POST(
            new Request("http://localhost/api/creative/assets", {
                method: "POST",
                headers: { "content-type": "application/json", "content-length": String(64 * 1024 + 1) },
                body: JSON.stringify({ conversationId: "conversation-one", sourceUrl: "/api/generation-log-assets/permanent/source.png" }),
            }),
        );

        expect(response.status).toBe(413);
        expect((await response.json()).msg).toBe("引用素材参数不能超过 64KB");
        expect(mocks.referenceAssetForUser).not.toHaveBeenCalled();
    });

    it("rejects an oversized multipart request before parsing it", async () => {
        const response = await POST(
            new Request("http://localhost/api/creative/assets", {
                method: "POST",
                headers: { "content-type": "multipart/form-data; boundary=test", "content-length": String(800 * 1024 * 1024 + 64 * 1024 + 1) },
                body: "--test--",
            }),
        );

        expect(response.status).toBe(413);
        expect((await response.json()).msg).toBe("上传素材超过 800MB");
        expect(mocks.uploadAssetForUser).not.toHaveBeenCalled();
    });
});

function request(conversationId: string, file: File) {
    const body = new FormData();
    body.set("conversationId", conversationId);
    body.set("file", file);
    return new Request("http://localhost/api/creative/assets", { method: "POST", body });
}
