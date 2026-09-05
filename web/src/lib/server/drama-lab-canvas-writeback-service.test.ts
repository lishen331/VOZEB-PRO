import { beforeEach, describe, expect, it, vi } from "vitest";
import { CanvasNodeType, type CanvasNodeData } from "@/app/(user)/canvas/types";
import type { DramaProject } from "@/lib/drama-project-contract";

type TestCanvasNode = Omit<CanvasNodeData, "metadata"> & { metadata?: Record<string, unknown> };

const mocks = vi.hoisted(() => ({
    getCanvas: vi.fn(),
    getCanvasWithOwner: vi.fn(),
    getProject: vi.fn(),
    updateProject: vi.fn(),
    getMedia: vi.fn(),
    resolveDramaLabProjectForRequest: vi.fn(),
}));

vi.mock("@/lib/server/canvas-project-service", () => ({ getDramaLabCanvasProjectWithOwnerForUser: mocks.getCanvasWithOwner }));
vi.mock("@/lib/server/drama-project-store", () => ({
    getDramaProject: mocks.getProject,
    updateDramaProject: mocks.updateProject,
    DramaProjectStoreError: class DramaProjectStoreError extends Error {
        constructor(
            message: string,
            readonly status: number,
        ) {
            super(message);
        }
    },
}));
vi.mock("@/lib/server/local-media-registry", () => ({
    getLocalMediaRegistration: mocks.getMedia,
    isLocalMediaRegistrationExpired: (value: { storageClass?: string; expiresAt?: string }) => value.storageClass === "temporary" && Boolean(value.expiresAt && Date.parse(value.expiresAt) <= Date.now()),
}));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({ resolveDramaLabProjectForRequest: mocks.resolveDramaLabProjectForRequest }));

import { DramaCanvasWritebackError, writebackDramaCanvasForUser } from "./drama-lab-canvas-writeback-service";

describe("drama lab canvas writeback service", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const project = fixture();
        mocks.getCanvas.mockResolvedValue(canvasFixture());
        mocks.getCanvasWithOwner.mockResolvedValue({ project: canvasFixture(), ownerUserId: "user-one" });
        mocks.getProject.mockResolvedValue(project);
        mocks.resolveDramaLabProjectForRequest.mockImplementation(async (userId: string, projectId: string) => ({ project: await mocks.getProject(projectId, userId), ownerUserId: userId }));
        mocks.updateProject.mockImplementation(async (_userId: string, next: DramaProject) => next);
        mocks.getMedia.mockResolvedValue({ ownerUserId: "user-one", projectId: "drama-one", type: "image", storageClass: "permanent", expiresAt: undefined });
    });

    it("applies an owned image node as the selected asset primary reference", async () => {
        const result = await writebackDramaCanvasForUser("user-one", "canvas-one", {
            projectId: "drama-one",
            episodeId: "episode-one",
            assetType: "character",
            assetId: "character-one",
            nodeId: "character-image",
            kind: "asset-reference",
            expectedProjectUpdatedAt: "2026-09-02T00:00:00.000Z",
        });

        expect(result.applied).toMatchObject({ kind: "asset-reference", assetType: "character", assetId: "character-one" });
        expect(result.project.characters[0]).toMatchObject({ primaryReferenceId: expect.any(String), referenceImageUrl: "/media/character.png", referenceStorageKey: "permanent/character.png" });
        expect(result.project.characters[0].references).toHaveLength(1);
        expect(mocks.updateProject).toHaveBeenCalledWith("user-one", expect.objectContaining({ id: "drama-one" }), "2026-09-02T00:00:00.000Z");
    });

    it("applies image and text results to a real shot without guessing IDs", async () => {
        const frame = await writebackDramaCanvasForUser("user-one", "canvas-one", {
            projectId: "drama-one",
            episodeId: "episode-one",
            shotId: "shot-one",
            nodeId: "shot-image",
            kind: "shot-frame",
            frameType: "key",
            expectedProjectUpdatedAt: "2026-09-02T00:00:00.000Z",
        });
        expect(frame.project.episodes[0].shots[0].frames?.key).toMatchObject({ status: "success", url: "/media/key.png", storageKey: "permanent/key.png" });

        mocks.getMedia.mockResolvedValue(null);
        const text = await writebackDramaCanvasForUser("user-one", "canvas-one", {
            projectId: "drama-one",
            episodeId: "episode-one",
            shotId: "shot-one",
            nodeId: "shot-text",
            kind: "shot-field",
            field: "videoPrompt",
            expectedProjectUpdatedAt: "2026-09-02T00:00:00.000Z",
        });
        expect(text.project.episodes[0].shots[0].videoPrompt).toBe("推镜头");
    });

    it("rejects locked frames and media owned by another user", async () => {
        const project = fixture();
        project.episodes[0].shots[0].frames = { key: { prompt: "old", status: "success", url: "/old.png", locked: true } };
        mocks.getProject.mockResolvedValue(project);
        await expect(writebackDramaCanvasForUser("user-one", "canvas-one", request("shot-image", { kind: "shot-frame", shotId: "shot-one", frameType: "key" }))).rejects.toMatchObject({ status: 409 });

        mocks.getProject.mockResolvedValue(fixture());
        mocks.getMedia.mockResolvedValue({ ownerUserId: "user-two", projectId: "drama-one", type: "image", storageClass: "permanent" });
        await expect(writebackDramaCanvasForUser("user-one", "canvas-one", request("shot-image", { kind: "shot-frame", shotId: "shot-one", frameType: "key" }))).rejects.toMatchObject({ status: 403 });
        expect(mocks.updateProject).not.toHaveBeenCalled();
    });

    it("accepts collaborator writeback for media owned by the stable project owner", async () => {
        mocks.getCanvasWithOwner.mockResolvedValue({ project: canvasFixture(), ownerUserId: "project-owner" });
        mocks.resolveDramaLabProjectForRequest.mockResolvedValue({ project: fixture(), ownerUserId: "project-owner" });
        mocks.getMedia.mockResolvedValue({ ownerUserId: "project-owner", projectId: "drama-one", type: "image", storageClass: "permanent" });

        const result = await writebackDramaCanvasForUser("collaborator", "canvas-one", request("shot-image", { kind: "shot-frame", shotId: "shot-one", frameType: "key" }));

        expect(result.project.episodes[0].shots[0].frames?.key).toMatchObject({ status: "success", storageKey: "permanent/key.png" });
        expect(mocks.updateProject).toHaveBeenCalledWith("project-owner", expect.objectContaining({ id: "drama-one" }), "2026-09-02T00:00:00.000Z");
    });

    it("rejects a canvas binding or project version mismatch before writing", async () => {
        mocks.getCanvasWithOwner.mockResolvedValue({ project: { ...canvasFixture(), sourceHandoffId: "drama-lab-canvas:other-project:episode:episode-one" }, ownerUserId: "user-one" });
        await expect(writebackDramaCanvasForUser("user-one", "canvas-one", request("shot-text", { kind: "shot-field", shotId: "shot-one", field: "description" }))).rejects.toMatchObject({ status: 409 });

        mocks.getCanvasWithOwner.mockResolvedValue({ project: canvasFixture(), ownerUserId: "user-one" });
        await expect(writebackDramaCanvasForUser("user-one", "canvas-one", { ...request("shot-text", { kind: "shot-field", shotId: "shot-one", field: "description" }), expectedProjectUpdatedAt: "2026-09-02T00:00:01.000Z" })).rejects.toMatchObject({
            status: 409,
        });
        expect(mocks.updateProject).not.toHaveBeenCalled();
    });

    it("maps a store conflict to a non-success response and never retries", async () => {
        mocks.updateProject.mockRejectedValue(Object.assign(new Error("project changed"), { status: 409 }));
        await expect(writebackDramaCanvasForUser("user-one", "canvas-one", request("shot-text", { kind: "shot-field", shotId: "shot-one", field: "description" }))).rejects.toMatchObject({ status: 409 });
        expect(mocks.updateProject).toHaveBeenCalledTimes(1);
    });

    it("validates target fields and node types", async () => {
        await expect(writebackDramaCanvasForUser("user-one", "canvas-one", request("shot-text", { kind: "shot-field", shotId: "shot-one", field: "updatedAt" }))).rejects.toMatchObject({ status: 400 });
        await expect(writebackDramaCanvasForUser("user-one", "canvas-one", request("shot-text", { kind: "shot-frame", shotId: "shot-one", frameType: "key" }))).rejects.toMatchObject({ status: 422 });
        await expect(writebackDramaCanvasForUser("user-one", "canvas-one", request("shot-image", { kind: "shot-video", shotId: "shot-one" }))).rejects.toMatchObject({ status: 422 });
    });

    it.each(["https://attacker.example/image.png", "//attacker.example/image.png", "ftp://attacker.example/image.png", "https:\\\\attacker.example\\image.png"])("rejects an external media URL without an owned storage registration: %s", async (url) => {
        const canvas = canvasFixture();
        canvas.nodes = canvas.nodes.map((node) => (node.id === "shot-image" ? { ...node, metadata: { ...node.metadata, content: url, storageKey: "" } } : node));
        mocks.getCanvasWithOwner.mockResolvedValue({ project: canvas, ownerUserId: "user-one" });

        await expect(writebackDramaCanvasForUser("user-one", "canvas-one", request("shot-image", { kind: "shot-frame", shotId: "shot-one", frameType: "key" }))).rejects.toMatchObject({ status: 403 });
        expect(mocks.getMedia).not.toHaveBeenCalled();
        expect(mocks.updateProject).not.toHaveBeenCalled();
    });

    it("keeps local relative media URLs valid without a storage key", async () => {
        const canvas = canvasFixture();
        canvas.nodes = canvas.nodes.map((node) => (node.id === "shot-image" ? { ...node, metadata: { ...node.metadata, content: "/media/local-key.png", storageKey: "" } } : node));
        mocks.getCanvasWithOwner.mockResolvedValue({ project: canvas, ownerUserId: "user-one" });

        const result = await writebackDramaCanvasForUser("user-one", "canvas-one", request("shot-image", { kind: "shot-frame", shotId: "shot-one", frameType: "key" }));

        expect(result.project.episodes[0].shots[0].frames?.key).toMatchObject({ status: "success", url: "/media/local-key.png", storageKey: undefined });
        expect(mocks.getMedia).not.toHaveBeenCalled();
    });

    it("keeps registered external media URLs valid", async () => {
        const canvas = canvasFixture();
        canvas.nodes = canvas.nodes.map((node) => (node.id === "shot-image" ? { ...node, metadata: { ...node.metadata, content: "https://cdn.example/image.png", storageKey: "permanent/key.png" } } : node));
        mocks.getCanvasWithOwner.mockResolvedValue({ project: canvas, ownerUserId: "user-one" });

        const result = await writebackDramaCanvasForUser("user-one", "canvas-one", request("shot-image", { kind: "shot-frame", shotId: "shot-one", frameType: "key" }));

        expect(result.project.episodes[0].shots[0].frames?.key).toMatchObject({ status: "success", url: "https://cdn.example/image.png", storageKey: "permanent/key.png" });
        expect(mocks.getMedia).toHaveBeenCalledWith("permanent/key.png");
    });
});

function request(nodeId: string, overrides: Record<string, unknown>) {
    return { projectId: "drama-one", episodeId: "episode-one", nodeId, expectedProjectUpdatedAt: "2026-09-02T00:00:00.000Z", ...overrides };
}

function canvasFixture(): { id: string; sourceHandoffId: string; updatedAt: string; nodes: TestCanvasNode[] } {
    return {
        id: "canvas-one",
        sourceHandoffId: "drama-lab-canvas:drama-one:episode:episode-one",
        updatedAt: "2026-09-02T00:00:00.000Z",
        nodes: [
            {
                id: "character-image",
                type: CanvasNodeType.Image,
                title: "角色参考",
                position: { x: 0, y: 0 },
                width: 100,
                height: 100,
                metadata: { dramaProjectId: "drama-one", episodeId: "episode-one", assetId: "character-one", assetType: "character", content: "/media/character.png", storageKey: "permanent/character.png", naturalWidth: 512, naturalHeight: 512 },
            },
            {
                id: "shot-image",
                type: CanvasNodeType.Image,
                title: "关键帧",
                position: { x: 0, y: 0 },
                width: 100,
                height: 100,
                metadata: { dramaProjectId: "drama-one", episodeId: "episode-one", shotId: "shot-one", content: "/media/key.png", storageKey: "permanent/key.png", naturalWidth: 720, naturalHeight: 1280 },
            },
            { id: "shot-text", type: CanvasNodeType.Text, title: "提示词", position: { x: 0, y: 0 }, width: 100, height: 100, metadata: { dramaProjectId: "drama-one", episodeId: "episode-one", shotId: "shot-one", content: "推镜头" } },
        ],
    };
}

function fixture(): DramaProject {
    return {
        id: "drama-one",
        title: "短剧",
        summary: "",
        style: "电影",
        ratio: "9:16",
        status: "active",
        characters: [{ id: "character-one", name: "角色", description: "", references: [] }],
        scenes: [],
        props: [],
        clues: [],
        defaultVideoMode: "storyboard",
        episodes: [
            {
                id: "episode-one",
                title: "第一集",
                script: "",
                outline: "",
                hook: "",
                nextPreview: "",
                sourceRange: "",
                reviewStatus: "draft",
                shots: [
                    {
                        id: "shot-one",
                        order: 1,
                        title: "镜头",
                        description: "旧描述",
                        sourceText: "",
                        shotBoundary: "",
                        dialogue: "",
                        narration: "",
                        utterances: [],
                        imagePrompt: "",
                        videoPrompt: "",
                        cameraMotion: "",
                        duration: 4,
                        characterIds: [],
                        propIds: [],
                        clueIds: [],
                        frames: {},
                    },
                ],
            },
        ],
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
    };
}

void DramaCanvasWritebackError;
