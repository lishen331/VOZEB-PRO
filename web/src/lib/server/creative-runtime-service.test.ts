import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getCreativeConversation: vi.fn(),
    listCreativeAssets: vi.fn(),
    getCreativeAsset: vi.fn(),
    getCreativeConversationsByIds: vi.fn(),
    registerCreativeAssets: vi.fn(),
    writePersistentMediaDataUrl: vi.fn(),
    deleteCreativeConversationAggregates: vi.fn(),
    deleteUserMediaAssetsCascade: vi.fn(),
    getLocalMediaRegistration: vi.fn(),
    readRegisteredMediaBytes: vi.fn(),
}));

vi.mock("@/lib/server/creative-runtime-store", () => ({
    createCreativeConversation: vi.fn(),
    getCreativeAsset: mocks.getCreativeAsset,
    getCreativeConversation: mocks.getCreativeConversation,
    getCreativeConversationsByIds: mocks.getCreativeConversationsByIds,
    listCreativeAssets: mocks.listCreativeAssets,
    listCreativeConversations: vi.fn(),
    listCreativeMessages: vi.fn(),
    registerCreativeAssets: mocks.registerCreativeAssets,
    updateCreativeConversation: vi.fn(),
}));
vi.mock("@/lib/server/reference-asset-store", async (importOriginal) => ({ ...(await importOriginal<typeof import("./reference-asset-store")>()), writePersistentMediaDataUrl: mocks.writePersistentMediaDataUrl }));
vi.mock("@/lib/server/creative-entity-deletion-store", () => ({ deleteCreativeConversationAggregates: mocks.deleteCreativeConversationAggregates }));
vi.mock("@/lib/server/user-media-deletion-service", () => ({ deleteUserMediaAssetsCascade: mocks.deleteUserMediaAssetsCascade }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistration: mocks.getLocalMediaRegistration, isLocalMediaRegistrationExpired: vi.fn(() => false) }));
vi.mock("@/lib/server/object-storage-service", () => ({ readRegisteredMediaBytes: mocks.readRegisteredMediaBytes }));

import { listAssetsForUser, getAssetForUser, deleteConversationsForUser, referenceAssetForUser, registerGenerationTaskAssetsForUser, uploadAssetForUser } from "./creative-runtime-service";

function file(name: string, type: string, size = 4): File {
    return { name, type, size, arrayBuffer: async () => new Uint8Array(Math.min(size, 4)).buffer } as File;
}

describe("创作会话素材上传", () => {
    beforeEach(() => {
        mocks.getCreativeConversation.mockReset().mockResolvedValue({ id: "conversation-one", userId: "user-one", surface: "chat", status: "active" });
        mocks.getCreativeConversationsByIds.mockReset().mockResolvedValue([{ id: "conversation-one", userId: "user-one", surface: "chat", status: "active" }]);
        mocks.writePersistentMediaDataUrl.mockReset().mockResolvedValue({ token: "persistent-one.mp4", storage: "local", bytes: 4, mimeType: "video/mp4" });
        mocks.deleteCreativeConversationAggregates.mockReset().mockResolvedValue({ deletedConversations: 1, deletedProjects: 0, mediaStorageKeys: ["permanent/one.png"] });
        mocks.deleteUserMediaAssetsCascade.mockReset().mockResolvedValue({ deletedFiles: 1, deletedBytes: 4, blocked: [] });
        mocks.getLocalMediaRegistration.mockReset().mockResolvedValue({
            storageKey: "permanent/source.png",
            scope: "generation",
            storageClass: "permanent",
            type: "image",
            ownerUserId: "user-one",
            source: "generation",
            mimeType: "image/png",
            bytes: 4,
        });
        mocks.readRegisteredMediaBytes.mockReset().mockResolvedValue(Buffer.from("image"));
        mocks.registerCreativeAssets.mockReset().mockImplementation(async ([input]) => [{ ...input, id: "asset-one", status: "ready", metadata: input.metadata || {}, createdAt: 1, updatedAt: 1 }]);
    });

    it("serves previously saved loopback audio through the authenticated same-origin route", async () => {
        const path = "/api/reference-assets/permanent/2026/09/09/audio/20260909-101704-fe5a15f4-9f72-4a73-9e01-dd2adcbbbab2.mp3";
        const asset = { id: "audio-one", userId: "user-one", status: "ready", type: "audio", remoteUrl: "http://127.0.0.1:3000" + path };
        mocks.listCreativeAssets.mockResolvedValue([asset]);
        mocks.getCreativeAsset.mockResolvedValue(asset);
        expect(await listAssetsForUser("user-one", "conversation-one")).toEqual([expect.objectContaining({ serverUrl: path, remoteUrl: undefined })]);
        expect(await getAssetForUser("user-one", "audio-one")).toMatchObject({ serverUrl: path, remoteUrl: undefined });
        expect(asset.remoteUrl).toContain("127.0.0.1");
    });

    it("does not rewrite external audio or arbitrary loopback URLs as local assets", async () => {
        const assets = [
            { type: "audio", remoteUrl: "https://cdn.example/audio.mp3" },
            { type: "audio", remoteUrl: "http://127.0.0.1:3000/api/admin/settings" },
        ];
        mocks.listCreativeAssets.mockResolvedValue(assets);
        expect(await listAssetsForUser("user-one", "conversation-one")).toEqual(assets);
    });

    it("hard-deletes conversations before reclaiming only their candidate media", async () => {
        await expect(deleteConversationsForUser("user-one", ["conversation-one", "conversation-one"])).resolves.toBe(1);

        expect(mocks.deleteCreativeConversationAggregates).toHaveBeenCalledWith("user-one", ["conversation-one"]);
        expect(mocks.deleteUserMediaAssetsCascade).toHaveBeenCalledWith("user-one", ["permanent/one.png"]);
    });

    it("rejects deleting project conversations through the ordinary chat endpoint", async () => {
        mocks.getCreativeConversationsByIds.mockResolvedValue([{ id: "conversation-one", userId: "user-one", surface: "canvas", projectId: "canvas-one", status: "active" }]);

        await expect(deleteConversationsForUser("user-one", ["conversation-one"])).rejects.toMatchObject({ status: 409 });
        expect(mocks.deleteCreativeConversationAggregates).not.toHaveBeenCalled();
    });

    it("stores image, video and audio as stable assets without persisting base64", async () => {
        const asset = await uploadAssetForUser("user-one", "conversation-one", file("clip.mp4", "video/mp4"));

        expect(mocks.writePersistentMediaDataUrl).toHaveBeenCalledWith(
            expect.stringMatching(/^data:video\/mp4;base64,/),
            "video",
            expect.objectContaining({ ownerUserId: "user-one", conversationId: "conversation-one", originalName: "clip.mp4", maxBytes: 800 * 1024 * 1024 }),
        );
        expect(asset).toMatchObject({ id: "asset-one", type: "video", serverUrl: "/api/reference-assets/persistent-one.mp4", storageKey: "persistent-one.mp4" });
        expect(JSON.stringify(mocks.registerCreativeAssets.mock.calls[0][0])).not.toContain("base64");
    });

    it("keeps the internal storage key while marking object-backed uploads", async () => {
        mocks.writePersistentMediaDataUrl.mockResolvedValue({ token: "permanent/object.png", storage: "object", bytes: 4, mimeType: "image/png" });

        const asset = await uploadAssetForUser("user-one", "conversation-one", file("image.png", "image/png"));

        expect(asset).toMatchObject({ storageKind: "object", storageKey: "permanent/object.png", serverUrl: "/api/reference-assets/permanent/object.png" });
    });

    it("copies an owned generated asset server-side before attaching it to Agent", async () => {
        mocks.writePersistentMediaDataUrl.mockResolvedValue({ token: "permanent/copied.png", storage: "object", bytes: 5, mimeType: "image/png" });

        const asset = await referenceAssetForUser("user-one", "conversation-one", {
            sourceUrl: "/api/generation-log-assets/permanent/source.png",
            title: "商品主图",
        });

        expect(mocks.getLocalMediaRegistration).toHaveBeenCalledWith("permanent/source.png");
        expect(mocks.readRegisteredMediaBytes).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "user-one" }), 20 * 1024 * 1024);
        expect(mocks.writePersistentMediaDataUrl).toHaveBeenCalledWith(
            expect.stringMatching(/^data:image\/png;base64,/),
            "image",
            expect.objectContaining({ ownerUserId: "user-one", conversationId: "conversation-one", source: "creative-reference", originalName: "商品主图.png" }),
        );
        expect(asset).toMatchObject({ type: "image", storageKey: "permanent/copied.png", serverUrl: "/api/reference-assets/permanent/copied.png" });
    });

    it("rejects foreign, missing and mismatched generated media references", async () => {
        mocks.getLocalMediaRegistration.mockResolvedValueOnce(null);
        await expect(referenceAssetForUser("user-one", "conversation-one", { sourceUrl: "/api/generation-log-assets/permanent/missing.png" })).rejects.toMatchObject({ status: 404 });

        mocks.getLocalMediaRegistration.mockResolvedValueOnce({ storageKey: "permanent/foreign.png", scope: "generation", type: "image", ownerUserId: "user-two", mimeType: "image/png", bytes: 4 });
        await expect(referenceAssetForUser("user-one", "conversation-one", { sourceUrl: "/api/generation-log-assets/permanent/foreign.png" })).rejects.toMatchObject({ status: 404 });

        mocks.getLocalMediaRegistration.mockResolvedValueOnce({ storageKey: "permanent/source.png", scope: "reference", type: "image", ownerUserId: "user-one", mimeType: "image/png", bytes: 4 });
        await expect(referenceAssetForUser("user-one", "conversation-one", { sourceUrl: "/api/generation-log-assets/permanent/source.png" })).rejects.toMatchObject({ status: 404 });
        expect(mocks.readRegisteredMediaBytes).not.toHaveBeenCalled();
    });

    it("rejects unsupported files, oversized files and other users' conversations", async () => {
        await expect(uploadAssetForUser("user-one", "conversation-one", file("notes.pdf", "application/pdf"))).rejects.toMatchObject({ status: 400 });
        await expect(uploadAssetForUser("user-one", "conversation-one", file("vector.svg", "image/svg+xml"))).rejects.toMatchObject({ status: 400 });
        await expect(uploadAssetForUser("user-one", "conversation-one", file("limit.mp4", "video/mp4", 20 * 1024 * 1024))).resolves.toMatchObject({ id: "asset-one" });
        await expect(uploadAssetForUser("user-one", "conversation-one", file("large.mp4", "video/mp4", 800 * 1024 * 1024 + 1))).rejects.toMatchObject({ status: 413 });
        mocks.getCreativeConversation.mockResolvedValueOnce({ id: "conversation-one", userId: "user-two", status: "active" });
        await expect(uploadAssetForUser("user-one", "conversation-one", file("image.png", "image/png"))).rejects.toMatchObject({ status: 404 });
    });

    it("registers unified Agent task media against the owned conversation", async () => {
        const assets = await registerGenerationTaskAssetsForUser("user-one", {
            conversationId: "conversation-one",
            runId: "run-one",
            surface: "chat",
            taskId: "task-one",
            title: "商品主图",
            assets: [{ type: "image", url: "/api/generation-log-assets/user/file.png", mimeType: "image/png", width: 1024, height: 1024 }],
        });

        expect(assets[0]).toMatchObject({ type: "image", serverUrl: "/api/generation-log-assets/user/file.png", storageKind: "local" });
        expect(mocks.registerCreativeAssets).toHaveBeenCalledWith([expect.objectContaining({ conversationId: "conversation-one", sourceRunId: "run-one", sourceTaskId: "task-one", metadata: { surface: "chat", projectId: undefined } })]);
    });
});
