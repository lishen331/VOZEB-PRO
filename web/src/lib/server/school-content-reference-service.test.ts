import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    requireActiveSchoolContext: vi.fn(),
    getWorkPublicationForUser: vi.fn(),
    getCanvasProjectForUser: vi.fn(),
    getDramaProjectForUser: vi.fn(),
    getLibraryAsset: vi.fn(),
    getGenerationLogForUser: vi.fn(),
    requireVisibleIp: vi.fn(),
}));

vi.mock("./school-access-service", () => ({
    requireActiveSchoolContext: mocks.requireActiveSchoolContext,
    SchoolServiceError: class SchoolServiceError extends Error {
        constructor(
            public status: number,
            message: string,
        ) {
            super(message);
        }
    },
}));
vi.mock("./work-publication-service", () => ({ getWorkPublicationForUser: mocks.getWorkPublicationForUser }));
vi.mock("./canvas-project-service", () => ({ getCanvasProjectForUser: mocks.getCanvasProjectForUser }));
vi.mock("./drama-project-service", () => ({ getDramaProjectForUser: mocks.getDramaProjectForUser }));
vi.mock("./library-asset-store", () => ({ getLibraryAsset: mocks.getLibraryAsset }));
vi.mock("./generation-log-store", () => ({ getGenerationLogForUser: mocks.getGenerationLogForUser }));
vi.mock("./ip-library-access-service", () => ({ requireVisibleIp: mocks.requireVisibleIp }));

import { validateSchoolContentReferences } from "./school-content-reference-service";

describe("validateSchoolContentReferences", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.requireActiveSchoolContext.mockResolvedValue({ school: { id: "school-a", status: "active" }, membership: { status: "active" } });
        mocks.getWorkPublicationForUser.mockResolvedValue({ id: "work-a", currentVersion: { title: "公开作品" }, currentPreview: { previewUrl: "/work-preview.webp" } });
        mocks.getCanvasProjectForUser.mockResolvedValue({ id: "canvas-a", title: "画布项目" });
        mocks.getDramaProjectForUser.mockResolvedValue({ id: "drama-a", title: "短剧项目" });
        mocks.getLibraryAsset.mockResolvedValue({ id: "asset-a", title: "素材", coverUrl: "/asset-preview.webp" });
        mocks.getGenerationLogForUser.mockResolvedValue({ id: "generation-a", title: "生成结果", assets: [{ serverUrl: "/api/generation-log-assets/result.webp", url: "https://upstream.invalid/result.webp" }] });
        mocks.requireVisibleIp.mockResolvedValue({
            detail: {
                id: "ip-a",
                title: "星海计划",
            },
            subIp: { id: "child-a", title: "星海计划主线", items: [{ id: "ip-item-a" }] },
            userId: "user-a",
            schoolId: "school-a",
        });
    });

    it("validates child IP items and returns only a lightweight reference preview", async () => {
        const reference = { type: "ip", id: "ip-a", subIpId: "child-a", itemIds: ["ip-item-a"] };

        await expect(validateSchoolContentReferences({ userId: "user-a", schoolId: "school-a", references: [reference] })).resolves.toEqual([{ reference, title: "星海计划主线" }]);
        expect(mocks.requireVisibleIp).toHaveBeenCalledWith("user-a", "ip-a", "child-a", ["ip-item-a"]);
    });

    it("maps unauthorized child IP items to a tenant-safe 404", async () => {
        mocks.requireVisibleIp.mockRejectedValue(Object.assign(new Error("IP 内容项不存在或不属于当前子 IP"), { status: 403 }));

        await expect(validateSchoolContentReferences({ userId: "user-a", schoolId: "school-a", references: [{ type: "ip", id: "ip-a", subIpId: "child-b", itemIds: ["item-other"] }] })).rejects.toMatchObject({ status: 404 });
    });

    it("validates all five owner-scoped reference types and returns lightweight previews", async () => {
        const references = [
            { type: "work", id: "work-a", internal: "discard" },
            { type: "canvas", id: "canvas-a" },
            { type: "drama", id: "drama-a" },
            { type: "asset", id: "asset-a" },
            { type: "generation", id: "generation-a" },
        ];

        const previews = await validateSchoolContentReferences({ userId: "user-a", schoolId: "school-a", references });

        expect(previews).toEqual([
            { reference: { type: "work", id: "work-a" }, title: "公开作品", previewUrl: "/work-preview.webp" },
            { reference: { type: "canvas", id: "canvas-a" }, title: "画布项目" },
            { reference: { type: "drama", id: "drama-a" }, title: "短剧项目" },
            { reference: { type: "asset", id: "asset-a" }, title: "素材", previewUrl: "/asset-preview.webp" },
            { reference: { type: "generation", id: "generation-a" }, title: "生成结果", previewUrl: "/api/generation-log-assets/result.webp" },
        ]);
        expect(mocks.getWorkPublicationForUser).toHaveBeenCalledWith("user-a", "work-a");
        expect(mocks.getCanvasProjectForUser).toHaveBeenCalledWith("user-a", "canvas-a");
        expect(mocks.getDramaProjectForUser).toHaveBeenCalledWith("user-a", "drama-a");
        expect(mocks.getLibraryAsset).toHaveBeenCalledWith("user-a", "asset-a");
        expect(mocks.getGenerationLogForUser).toHaveBeenCalledWith("user-a", "generation-a");
    });

    it("rejects a member whose active school differs from the requested school", async () => {
        mocks.requireActiveSchoolContext.mockResolvedValue({ school: { id: "school-b", status: "active" }, membership: { status: "active" } });

        await expect(validateSchoolContentReferences({ userId: "user-a", schoolId: "school-a", references: [{ type: "asset", id: "asset-a" }] })).rejects.toMatchObject({ status: 404 });
        expect(mocks.getLibraryAsset).not.toHaveBeenCalled();
    });

    it.each([
        ["work", "getWorkPublicationForUser"],
        ["canvas", "getCanvasProjectForUser"],
        ["drama", "getDramaProjectForUser"],
        ["asset", "getLibraryAsset"],
        ["generation", "getGenerationLogForUser"],
    ] as const)("rejects missing, deleted, or other-user %s records", async (type, mockName) => {
        mocks[mockName].mockResolvedValue(null);

        await expect(validateSchoolContentReferences({ userId: "user-a", schoolId: "school-a", references: [{ type, id: `${type}-other` }] })).rejects.toThrow("不存在或无权访问");
    });

    it.each([
        [[{ type: "unknown", id: "id-a" }], "成果引用无效"],
        [[{ type: "asset", id: " " }], "成果引用无效"],
        [
            [
                { type: "asset", id: "asset-a" },
                { type: "asset", id: "asset-a" },
            ],
            "成果引用不能重复",
        ],
    ])("rejects malformed or duplicate references", async (references, message) => {
        await expect(validateSchoolContentReferences({ userId: "user-a", schoolId: "school-a", references })).rejects.toThrow(message);
    });
});
