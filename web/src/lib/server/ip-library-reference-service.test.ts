import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    getIpDetailForUser: vi.fn(),
    createIpUsagesForUser: vi.fn(),
    getCanvasProject: vi.fn(),
    getDramaProject: vi.fn(),
}));

vi.mock("./ip-library-service", () => ({
    getIpDetailForUser: mocks.getIpDetailForUser,
    createIpUsagesForUser: mocks.createIpUsagesForUser,
}));
vi.mock("./canvas-project-store", () => ({ getCanvasProject: mocks.getCanvasProject }));
vi.mock("./drama-project-store", () => ({ getDramaProject: mocks.getDramaProject }));

import { recordIpReferenceUsage, validateGenerationContextIpReferences, validateCreativeProjectIpReferencesForRun, validateIpReferences } from "./ip-library-reference-service";

const detail = {
    id: "ip-one",
    title: "星海计划",
    slug: "star-sea",
    summary: "IP 简介",
    visibility: "public" as const,
    status: "published" as const,
    currentVersionId: "version-two",
    isExclusive: false,
    coverPreviewUrl: "/api/ip-library/ip-one/cover?versionId=version-one",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
    version: {
        id: "version-one",
        ipId: "ip-one",
        versionNumber: 1,
        title: "星海计划 v1",
        summary: "历史发布版",
        status: "published" as const,
        publishedAt: "2026-08-18T00:00:00.000Z",
        createdAt: "2026-08-18T00:00:00.000Z",
        items: [
            { id: "item-text", versionId: "version-one", kind: "text" as const, category: "story_summary" as const, title: "故事梗概", summary: "", textContent: "内容", sortOrder: 0, createdAt: "2026-08-18T00:00:00.000Z" },
            {
                id: "item-image",
                versionId: "version-one",
                kind: "image" as const,
                category: "character" as const,
                title: "主角",
                summary: "",
                previewUrl: "/api/ip-library/ip-one/items/item-image/media?versionId=version-one",
                sortOrder: 1,
                createdAt: "2026-08-18T00:00:00.000Z",
            },
        ],
    },
};

describe("IP library references", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.getIpDetailForUser.mockResolvedValue(detail);
        mocks.createIpUsagesForUser.mockResolvedValue([{ id: "usage-one" }]);
        mocks.getCanvasProject.mockResolvedValue(null);
        mocks.getDramaProject.mockResolvedValue(null);
    });

    it("resolves a pinned published version and only the selected stable items", async () => {
        const result = await validateIpReferences("user-one", [{ type: "ip", id: "ip-one", versionId: "version-one", itemIds: ["item-image"] }]);

        expect(mocks.getIpDetailForUser).toHaveBeenCalledWith("user-one", "ip-one", "version-one");
        expect(result).toEqual([
            {
                reference: { type: "ip", id: "ip-one", versionId: "version-one", itemIds: ["item-image"] },
                title: "星海计划",
                versionTitle: "星海计划 v1",
                versionNumber: 1,
                coverPreviewUrl: detail.coverPreviewUrl,
                items: [{ id: "item-image", kind: "image", category: "character", title: "主角", previewUrl: detail.version.items[1].previewUrl }],
            },
        ]);
        expect(JSON.stringify(result)).not.toContain("textContent");
        expect(JSON.stringify(result)).not.toContain("storageKey");
    });

    it("allows a historical published version and expands an empty item list to the full version preview", async () => {
        const [preview] = await validateIpReferences("student-one", [{ type: "ip", id: "ip-one", versionId: "version-one", itemIds: [] }]);

        expect(preview.versionNumber).toBe(1);
        expect(preview.items.map((item) => item.id)).toEqual(["item-text", "item-image"]);
    });

    it.each([403, 404])("preserves revoked or cross-school access errors (%s)", async (status) => {
        mocks.getIpDetailForUser.mockRejectedValue(Object.assign(new Error("IP 不存在或无权访问"), { status }));

        await expect(validateIpReferences("student-one", [{ type: "ip", id: "ip-one", versionId: "version-one", itemIds: [] }])).rejects.toMatchObject({ status });
    });

    it("rejects unknown items and duplicate selections before recording usage", async () => {
        await expect(validateIpReferences("user-one", [{ type: "ip", id: "ip-one", versionId: "version-one", itemIds: ["missing"] }])).rejects.toMatchObject({ status: 404 });
        await expect(
            validateIpReferences("user-one", [
                { type: "ip", id: "ip-one", versionId: "version-one", itemIds: ["item-image"] },
                { type: "ip", id: "ip-one", versionId: "version-one", itemIds: ["item-image"] },
            ]),
        ).rejects.toMatchObject({ status: 400 });
        expect(mocks.createIpUsagesForUser).not.toHaveBeenCalled();
    });

    it("records one reference usage per validated pinned version", async () => {
        const references = [{ type: "ip" as const, id: "ip-one", versionId: "version-one", itemIds: ["item-text"] }];

        await recordIpReferenceUsage("user-one", { targetType: "canvas", targetId: "canvas-one", references });

        expect(mocks.createIpUsagesForUser).toHaveBeenCalledWith("user-one", [
            {
                ipId: "ip-one",
                versionId: "version-one",
                itemIds: ["item-text"],
                action: "reference",
                targetType: "canvas",
                targetId: "canvas-one",
            },
        ]);
    });

    it("revalidates the pinned references before a canvas or drama generation run", async () => {
        const reference = { type: "ip" as const, id: "ip-one", versionId: "version-one", itemIds: [] };
        mocks.getCanvasProject.mockResolvedValue({ id: "canvas-one", ipReferences: [reference] });
        mocks.getDramaProject.mockResolvedValue({ id: "drama-one", ipReferences: [reference] });

        await validateCreativeProjectIpReferencesForRun("user-one", "canvas", "canvas-one");
        await validateCreativeProjectIpReferencesForRun("user-one", "drama", "drama-one");

        expect(mocks.getIpDetailForUser).toHaveBeenCalledTimes(2);
        expect(mocks.getCanvasProject).toHaveBeenCalledWith("canvas-one", "user-one");
        expect(mocks.getDramaProject).toHaveBeenCalledWith("drama-one", "user-one");
    });

    it("only revalidates direct generation tasks that belong to a canvas or drama project", async () => {
        const reference = { type: "ip" as const, id: "ip-one", versionId: "version-one", itemIds: [] };
        mocks.getCanvasProject.mockResolvedValue({ id: "canvas-one", ipReferences: [reference] });

        await validateGenerationContextIpReferences("user-one", { surface: "chat", projectId: "conversation-one" });
        await validateGenerationContextIpReferences("user-one", { surface: "canvas", projectId: "canvas-one" });

        expect(mocks.getCanvasProject).toHaveBeenCalledOnce();
        expect(mocks.getIpDetailForUser).toHaveBeenCalledOnce();
    });

    it("revalidates pinned practice references without treating the session as a Canvas project", async () => {
        const reference = { type: "ip" as const, id: "ip-one", versionId: "version-one", itemIds: [] };

        await validateGenerationContextIpReferences("user-one", {
            surface: "canvas",
            executionProfile: "open-source-practice",
            projectId: "practice-session-one",
            ipReferences: [reference],
        });

        expect(mocks.getCanvasProject).not.toHaveBeenCalled();
        expect(mocks.getIpDetailForUser).toHaveBeenCalledWith("user-one", "ip-one", "version-one");
    });

    it("rejects malformed creative project task contexts before generation", async () => {
        await expect(validateGenerationContextIpReferences("user-one", { surface: "drama" })).rejects.toMatchObject({ status: 400 });
        expect(mocks.getDramaProject).not.toHaveBeenCalled();
    });
});
