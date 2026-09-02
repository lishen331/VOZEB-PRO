import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeFile } from "node:fs/promises";

import { zipSync, unzipSync } from "fflate";

import type { DramaProject } from "@/lib/drama-project-contract";

const mocks = vi.hoisted(() => ({
    getDramaProjectForUser: vi.fn(),
    createDramaProjectForUser: vi.fn(),
    updateDramaProjectForUser: vi.fn(),
    deleteDramaProjectForUser: vi.fn(),
    ensureDramaLabProjectGroup: vi.fn(),
    getLocalMediaRegistration: vi.fn(),
    writeReferenceMediaFile: vi.fn(),
    downloadMediaToFile: vi.fn(),
}));

vi.mock("@/lib/server/drama-project-service", () => ({
    createDramaProjectForUser: mocks.createDramaProjectForUser,
    deleteDramaProjectForUser: mocks.deleteDramaProjectForUser,
    getDramaProjectForUser: mocks.getDramaProjectForUser,
    updateDramaProjectForUser: mocks.updateDramaProjectForUser,
}));
vi.mock("@/lib/server/drama-lab-collaboration-service", () => ({ ensureDramaLabProjectGroup: mocks.ensureDramaLabProjectGroup }));
vi.mock("@/lib/server/local-media-registry", () => ({ getLocalMediaRegistration: mocks.getLocalMediaRegistration }));
vi.mock("@/lib/server/reference-asset-store", () => ({ writeReferenceMediaFile: mocks.writeReferenceMediaFile }));
vi.mock("@/lib/server/media-download", () => ({ downloadMediaToFile: mocks.downloadMediaToFile }));

import { DRAMA_LAB_ARCHIVE_FILE, DRAMA_LAB_ARCHIVE_FORMAT, DRAMA_LAB_ARCHIVE_VERSION, DramaLabProjectArchiveError, exportDramaLabProjectForUser, importDramaLabProjectForUser } from "./drama-lab-project-archive";

describe("drama lab project archive", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getDramaProjectForUser.mockResolvedValue(projectFixture());
        mocks.getLocalMediaRegistration.mockImplementation(async (key: string) =>
            key === "permanent/2026/09/02/images/ref.png"
                ? {
                      storageKey: key,
                      scope: "reference",
                      storageClass: "permanent",
                      type: "image",
                      ownerUserId: "user-one",
                      projectId: "project-one",
                      source: "test",
                      mimeType: "image/png",
                      bytes: 4,
                      createdAt: new Date().toISOString(),
                      storageProvider: "local",
                  }
                : null,
        );
        mocks.downloadMediaToFile.mockImplementation(async (_url: string, target: string) => writeFile(target, Buffer.from([1, 2, 3, 4])));
        mocks.createDramaProjectForUser.mockResolvedValue({
            id: "drama-new",
            creativeConversationId: "conversation-new",
            createdAt: "2026-09-02T00:00:00.000Z",
            updatedAt: "2026-09-02T00:00:00.000Z",
        });
        mocks.deleteDramaProjectForUser.mockResolvedValue(undefined);
        mocks.ensureDramaLabProjectGroup.mockResolvedValue({ id: "group-new", projectId: "drama-new", ownerUserId: "user-two" });
        mocks.updateDramaProjectForUser.mockImplementation(async (_userId: string, _id: string, value: unknown) => value);
        mocks.writeReferenceMediaFile.mockResolvedValue({ token: "permanent/2026/09/02/images/imported.png", url: "/api/reference-assets/permanent/2026/09/02/images/imported.png", bytes: 4, mimeType: "image/png" });
    });

    it("exports a manifest and media bytes in project.json", async () => {
        const result = await exportDramaLabProjectForUser({ userId: "user-one", projectId: "project-one", origin: "http://localhost" });
        const entries = unzipSync(result.data);
        const archive = JSON.parse(new TextDecoder().decode(entries[DRAMA_LAB_ARCHIVE_FILE]));

        expect(archive).toMatchObject({ format: DRAMA_LAB_ARCHIVE_FORMAT, version: DRAMA_LAB_ARCHIVE_VERSION, projectId: "project-one" });
        expect(archive.media).toHaveLength(1);
        expect(archive.media[0]).toMatchObject({ included: true, scope: "reference", type: "image", bytes: 4 });
        expect(entries[archive.media[0].zipPath]).toEqual(new Uint8Array([1, 2, 3, 4]));
        expect(archive.project.characters[0].referenceImageUrl).toBe(`media://${archive.media[0].id}`);
        expect(archive.project.characters[0].referenceStorageKey).toBe(`media-key://${archive.media[0].id}`);
    });

    it("reads project media as the stable storage owner for collaborator exports", async () => {
        await exportDramaLabProjectForUser({ userId: "collaborator", projectOwnerUserId: "user-one", projectId: "project-one", origin: "http://localhost" });

        expect(mocks.getLocalMediaRegistration).toHaveBeenCalledWith("permanent/2026/09/02/images/ref.png");
        expect(mocks.downloadMediaToFile).toHaveBeenCalled();
    });

    it("imports media, remaps every project identity, and clears running task references", async () => {
        const exported = await exportDramaLabProjectForUser({ userId: "user-one", projectId: "project-one", origin: "http://localhost" });
        const result = await importDramaLabProjectForUser({ userId: "user-two", archive: exported.data, origin: "http://localhost" });

        expect(mocks.createDramaProjectForUser).toHaveBeenCalledWith(
            "user-two",
            expect.objectContaining({ title: "测试项目", initialScript: "第一集剧本" }),
            expect.objectContaining({ executionProfile: undefined }),
        );
        expect(mocks.writeReferenceMediaFile).toHaveBeenCalledWith(expect.any(String), "image", "image/png", true, expect.objectContaining({ ownerUserId: "user-two", projectId: "drama-new" }));
        expect(result.mediaCount).toBe(1);
        expect(result.project.id).toBe("drama-new");
        expect(result.project.episodes[0].id).not.toBe("episode-one");
        expect(result.project.characters[0].id).not.toBe("character-one");
        expect(result.project.episodes[0].shots[0].id).not.toBe("shot-one");
        expect(result.project.episodes[0].shots[0].generationStatus).toBe("idle");
        expect(result.project.episodes[0].shots[0].generationTaskId).toBeUndefined();
        expect(result.project.characters[0].referenceImageUrl).toBe("/api/reference-assets/permanent/2026/09/02/images/imported.png");
        expect(result.project.characters[0].referenceStorageKey).toBe("permanent/2026/09/02/images/imported.png");
        expect(mocks.ensureDramaLabProjectGroup).toHaveBeenCalledWith("drama-new", "user-two");
    });

    it("imports a project whose episodes array is intentionally empty", async () => {
        const fixture = projectFixture();
        fixture.episodes = [];
        fixture.activeEpisodeId = undefined;
        mocks.getDramaProjectForUser.mockResolvedValue(fixture);

        const exported = await exportDramaLabProjectForUser({ userId: "user-one", projectId: "project-one", origin: "http://localhost" });
        const result = await importDramaLabProjectForUser({ userId: "user-two", archive: exported.data, origin: "http://localhost" });

        expect(mocks.createDramaProjectForUser).toHaveBeenCalledWith(
            "user-two",
            expect.objectContaining({ title: "测试项目", initialScript: "" }),
            expect.objectContaining({ executionProfile: undefined }),
        );
        expect(result.project.episodes).toEqual([]);
        expect(result.project.activeEpisodeId).toBeUndefined();
        expect(mocks.ensureDramaLabProjectGroup).toHaveBeenCalledWith("drama-new", "user-two");
    });

    it("rejects duplicate shot IDs across episodes before creating the imported project", async () => {
        const fixture = projectFixture();
        fixture.episodes.push({
            ...fixture.episodes[0],
            id: "episode-two",
            episodeNumber: 2,
            title: "第 2 集",
            shots: fixture.episodes[0].shots.map((shot) => ({ ...shot })),
        });
        mocks.getDramaProjectForUser.mockResolvedValue(fixture);

        const exported = await exportDramaLabProjectForUser({ userId: "user-one", projectId: "project-one", origin: "http://localhost" });

        await expect(importDramaLabProjectForUser({ userId: "user-two", archive: exported.data, origin: "http://localhost" })).rejects.toMatchObject({
            status: 422,
            message: expect.stringContaining("重复分镜 ID"),
        });
        expect(mocks.createDramaProjectForUser).not.toHaveBeenCalled();
    });

    it("rejects a shot that references a project-external asset ID", async () => {
        const fixture = projectFixture();
        fixture.episodes[0].shots[0].characterIds = ["character-ghost"];
        mocks.getDramaProjectForUser.mockResolvedValue(fixture);
        const exported = await exportDramaLabProjectForUser({ userId: "user-one", projectId: "project-one", origin: "http://localhost" });

        await expect(importDramaLabProjectForUser({ userId: "user-two", archive: exported.data })).rejects.toMatchObject({ status: 422, message: expect.stringContaining("角色 ID") });
        expect(mocks.createDramaProjectForUser).not.toHaveBeenCalled();
    });

    it("rejects media placeholders that are absent from the archive manifest", async () => {
        const manifest = {
            format: DRAMA_LAB_ARCHIVE_FORMAT,
            version: DRAMA_LAB_ARCHIVE_VERSION,
            exportedAt: new Date().toISOString(),
            projectId: "project-one",
            project: { ...projectFixture(), characters: [{ ...projectFixture().characters[0], referenceImageUrl: "media://media-ghost" }] },
            media: [],
            taskRefs: [],
        };
        const archive = zipSync({ [DRAMA_LAB_ARCHIVE_FILE]: new TextEncoder().encode(JSON.stringify(manifest)) });

        await expect(importDramaLabProjectForUser({ userId: "user-two", archive })).rejects.toMatchObject({ status: 422, message: expect.stringContaining("媒体引用了无效的归档媒体 ID") });
        expect(mocks.createDramaProjectForUser).not.toHaveBeenCalled();
    });

    it("does not carry source task IDs into the imported project", async () => {
        const fixture = projectFixture();
        fixture.episodes[0].shots[0].generationStatus = "success";
        fixture.episodes[0].shots[0].generationTaskId = "task-from-source-project";
        mocks.getDramaProjectForUser.mockResolvedValue(fixture);

        const exported = await exportDramaLabProjectForUser({ userId: "user-one", projectId: "project-one", origin: "http://localhost" });
        const result = await importDramaLabProjectForUser({ userId: "user-two", archive: exported.data, origin: "http://localhost" });

        expect(result.project.episodes[0].shots[0].generationTaskId).toBeUndefined();
    });

    it("rejects archive media paths that attempt traversal", async () => {
        const manifest = {
            format: DRAMA_LAB_ARCHIVE_FORMAT,
            version: DRAMA_LAB_ARCHIVE_VERSION,
            exportedAt: new Date().toISOString(),
            projectId: "project-one",
            project: projectFixture(),
            media: [{ id: "media-one", zipPath: "../outside.png", scope: "reference", type: "image", mimeType: "image/png", bytes: 1, included: true }],
            taskRefs: [],
        };
        const archive = zipSync({ [DRAMA_LAB_ARCHIVE_FILE]: new TextEncoder().encode(JSON.stringify(manifest)), "outside.png": new Uint8Array([1]) });

        await expect(importDramaLabProjectForUser({ userId: "user-two", archive })).rejects.toBeInstanceOf(DramaLabProjectArchiveError);
        expect(mocks.createDramaProjectForUser).not.toHaveBeenCalled();
    });

    it("rejects malformed ZIP input", async () => {
        await expect(importDramaLabProjectForUser({ userId: "user-two", archive: new Uint8Array([1, 2, 3]) })).rejects.toMatchObject({ status: 422 });
    });

    it("cleans up a newly created project when media restoration fails", async () => {
        mocks.writeReferenceMediaFile.mockRejectedValueOnce(new Error("disk full"));
        const exported = await exportDramaLabProjectForUser({ userId: "user-one", projectId: "project-one", origin: "http://localhost" });

        await expect(importDramaLabProjectForUser({ userId: "user-two", archive: exported.data })).rejects.toMatchObject({ status: 422, message: "disk full" });
        expect(mocks.deleteDramaProjectForUser).toHaveBeenCalledWith("user-two", "drama-new");
    });
});

function projectFixture(): DramaProject {
    return {
        id: "project-one",
        title: "测试项目",
        summary: "项目摘要",
        style: "写实",
        ratio: "9:16",
        status: "active",
        defaultVideoMode: "storyboard",
        createdAt: "2026-09-02T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
        characters: [
            {
                id: "character-one",
                name: "主角",
                description: "角色描述",
                referenceImageUrl: "/api/reference-assets/permanent/2026/09/02/images/ref.png",
                referenceStorageKey: "permanent/2026/09/02/images/ref.png",
                references: [],
            },
        ],
        scenes: [{ id: "scene-one", name: "室内", description: "场景", references: [] }],
        props: [{ id: "prop-one", name: "手机", description: "道具", references: [] }],
        clues: [],
        activeEpisodeId: "episode-one",
        episodes: [
            {
                id: "episode-one",
                episodeNumber: 1,
                title: "第 1 集",
                script: "第一集剧本",
                outline: "",
                hook: "",
                nextPreview: "",
                sourceRange: "",
                reviewStatus: "draft",
                shots: [
                    {
                        id: "shot-one",
                        order: 1,
                        title: "镜头 1",
                        description: "镜头描述",
                        sourceText: "原文",
                        shotBoundary: "",
                        dialogue: "",
                        narration: "",
                        utterances: [],
                        imagePrompt: "画面",
                        videoPrompt: "视频",
                        cameraMotion: "固定",
                        duration: 5,
                        characterIds: ["character-one"],
                        propIds: ["prop-one"],
                        clueIds: [],
                        sceneId: "scene-one",
                        generationStatus: "running",
                        generationTaskId: "task-running",
                    },
                ],
            },
        ],
    };
}
