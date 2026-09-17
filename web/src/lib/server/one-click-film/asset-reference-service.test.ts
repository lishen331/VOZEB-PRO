import { describe, expect, it } from "vitest";
import type { DramaAssetReference, DramaNamedAsset, DramaProject } from "@/lib/drama-project-contract";
import { OneClickAssetReferenceError, appendOneClickAssetReferences, applyOneClickAssetPatch, removeOneClickAssetReference, setOneClickAssetPrimaryReference } from "./asset-reference-service";

/**
 * 基线：L `PUT /characters/:id/image`（设为主图）与参考图上传/移除，
 * 排序语义沿用创作工坊 `createAssetGeneratedPrimary`：
 * 新主图置顶标记 primary，旧主图降级 history，其余保持相对顺序。
 */
const ref = (id: string, extra: Partial<DramaAssetReference> = {}): DramaAssetReference => ({
    id,
    url: `https://cdn/${id}.png`,
    source: "upload",
    label: id,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...extra,
});

function asset(extra: Partial<DramaNamedAsset> = {}): DramaNamedAsset {
    return { id: "a1", name: "林薇", description: "女主", ...extra } as DramaNamedAsset;
}

describe("one-click-film asset reference management (L parity)", () => {
    it("appends uploads without stealing an existing primary", () => {
        const source = asset({ references: [ref("r1"), ref("r2")], primaryReferenceId: "r2" });
        const patch = appendOneClickAssetReferences(source, [ref("r3")]);

        expect(patch.references.map((item) => item.id)).toEqual(["r1", "r2", "r3"]);
        // 用户已选定的主图不能因为一次上传被改掉
        expect(patch.primaryReferenceId).toBe("r2");
        expect(patch.referenceImageUrl).toBe("https://cdn/r2.png");
    });

    it("promotes the first upload when the asset had no references", () => {
        const patch = appendOneClickAssetReferences(asset(), [ref("r1"), ref("r2")]);
        expect(patch.primaryReferenceId).toBe("r1");
        expect(patch.references.map((item) => item.id)).toEqual(["r1", "r2"]);
    });

    it("rejects an empty upload", () => {
        expect(() => appendOneClickAssetReferences(asset(), [])).toThrow(OneClickAssetReferenceError);
    });

    it("sets a new primary, demoting the old one to history", () => {
        const source = asset({ references: [ref("r1"), ref("r2"), ref("r3")], primaryReferenceId: "r1" });
        const patch = setOneClickAssetPrimaryReference(source, "r3");

        expect(patch.primaryReferenceId).toBe("r3");
        expect(patch.references.map((item) => item.id)).toEqual(["r3", "r1", "r2"]);
        expect(patch.references[0].role).toBe("primary");
        expect(patch.references[1].role).toBe("history");
        // 旧字段镜像必须同步，否则旧读取路径拿不到主图
        expect(patch.referenceImageUrl).toBe("https://cdn/r3.png");
    });

    it("is a no-op when the target is already primary", () => {
        const source = asset({ references: [ref("r1"), ref("r2")], primaryReferenceId: "r1" });
        const patch = setOneClickAssetPrimaryReference(source, "r1");
        expect(patch.primaryReferenceId).toBe("r1");
        expect(patch.references.map((item) => item.id)).toEqual(["r1", "r2"]);
    });

    it("rejects an unknown reference id with 404", () => {
        try {
            setOneClickAssetPrimaryReference(asset({ references: [ref("r1")] }), "nope");
            throw new Error("should have thrown");
        } catch (error) {
            expect(error).toBeInstanceOf(OneClickAssetReferenceError);
            expect((error as OneClickAssetReferenceError).status).toBe(404);
        }
    });

    it("moves the primary forward when the primary is removed", () => {
        const source = asset({ references: [ref("r1"), ref("r2"), ref("r3")], primaryReferenceId: "r1" });
        const patch = removeOneClickAssetReference(source, "r1");
        expect(patch.references.map((item) => item.id)).toEqual(["r2", "r3"]);
        expect(patch.primaryReferenceId).toBe("r2");
    });

    it("keeps the primary when a non-primary reference is removed", () => {
        const source = asset({ references: [ref("r1"), ref("r2")], primaryReferenceId: "r2" });
        const patch = removeOneClickAssetReference(source, "r1");
        expect(patch.primaryReferenceId).toBe("r2");
    });

    it("clears the primary mirror when the last reference is removed", () => {
        const patch = removeOneClickAssetReference(asset({ references: [ref("r1")], primaryReferenceId: "r1" }), "r1");
        expect(patch.references).toEqual([]);
        expect(patch.primaryReferenceId).toBeUndefined();
        expect(patch.referenceImageUrl).toBeUndefined();
    });

    it("applies a patch onto the right project collection without mutating input", () => {
        const project = {
            id: "p1",
            characters: [asset({ id: "a1" })],
            scenes: [asset({ id: "s1", name: "车站" })],
            props: [],
            clues: [],
            episodes: [],
        } as unknown as DramaProject;
        const snapshot = structuredClone(project);

        const next = applyOneClickAssetPatch(project, "characters", "a1", { description: "改后描述" });
        expect(next.characters[0].description).toBe("改后描述");
        expect(next.scenes[0].name).toBe("车站");
        expect(project).toEqual(snapshot);

        expect(() => applyOneClickAssetPatch(project, "props", "nope", {})).toThrow("资产不存在");
    });
});
