import { describe, expect, it } from "vitest";
import type { DramaAssetReference } from "@/lib/drama-project-contract";
import type { OneClickAsset } from "./asset-crud";
import { OneClickAssetLibraryError, buildOneClickLibraryApply, buildOneClickLibraryPayload } from "./asset-library-service";

/**
 * 基线：L `add-to-library` / `add-to-material-library` / `image-from-library`。
 *
 * L 有"角色库/场景库/道具库"与"素材库"两套；V 只有统一素材库，靠 metadata.dramaAssetType
 * 区分类别，因此 L 那两个存入端点在 V 侧收敛为同一动作（结构差异，不是丢语义）。
 */
const ref = (id: string, extra: Partial<DramaAssetReference> = {}): DramaAssetReference => ({
    id,
    url: `https://cdn/${id}.png`,
    source: "upload",
    label: id,
    createdAt: "2026-09-01T00:00:00.000Z",
    ...extra,
});

function asset(extra: Partial<OneClickAsset> = {}): OneClickAsset {
    return { id: "a1", name: "林薇", description: "女主", references: [], ...extra } as OneClickAsset;
}

describe("one-click-film asset library bridge (L parity)", () => {
    it("builds an image payload tagged with the drama asset type", () => {
        const payload = buildOneClickLibraryPayload(asset({ references: [ref("r1", { storageKey: "key-1", width: 720, height: 1280 })], primaryReferenceId: "r1", appearance: "圆脸短发", polishedPrompt: "角色四视图提示词" }), "characters");

        expect(payload.kind).toBe("image");
        expect(payload.title).toBe("林薇");
        expect(payload.coverUrl).toBe("https://cdn/r1.png");
        // 类别靠 metadata.dramaAssetType 区分，L 用单数
        expect(payload.metadata.dramaAssetType).toBe("character");
        expect(payload.metadata.source).toBe("one-click-film");
        // 视觉字段必须一并带入，否则取用后还得重写提示词
        expect(payload.metadata.appearance).toBe("圆脸短发");
        expect(payload.metadata.polishedPrompt).toBe("角色四视图提示词");
        expect(payload.data.storageKey).toBe("key-1");
        expect(payload.data.width).toBe(720);
        expect(payload.tags).toEqual(["一键成片", "角色"]);
    });

    it("maps scenes and props to their singular library types", () => {
        const source = asset({ references: [ref("r1")], primaryReferenceId: "r1" });
        expect(buildOneClickLibraryPayload(source, "scenes").metadata.dramaAssetType).toBe("scene");
        expect(buildOneClickLibraryPayload(source, "props").metadata.dramaAssetType).toBe("prop");
    });

    it("carries a character voice profile into the library entry", () => {
        const payload = buildOneClickLibraryPayload(asset({ references: [ref("r1")], primaryReferenceId: "r1", voiceProfile: { voice: "coral", speed: 1.1, instructions: "清冷" } }), "characters");
        expect(payload.metadata.voiceProfile).toEqual({ voice: "coral", speed: 1.1, instructions: "清冷" });
        // 场景/道具没有音色，不应凭空带上
        expect(buildOneClickLibraryPayload(asset({ references: [ref("r1")], primaryReferenceId: "r1", voiceProfile: { voice: "coral", speed: 1, instructions: "" } }), "scenes").metadata.voiceProfile).toBeUndefined();
    });

    it("refuses to store an asset without a reference image", () => {
        expect(() => buildOneClickLibraryPayload(asset(), "characters")).toThrow(OneClickAssetLibraryError);
        expect(() => buildOneClickLibraryPayload(asset(), "characters")).toThrow("请先为该资产生成或上传参考图");
    });

    it("applies a library image as the new primary and demotes the old one", () => {
        const patch = buildOneClickLibraryApply(asset({ references: [ref("r1"), ref("r2")], primaryReferenceId: "r1" }), {
            id: "lib-1",
            kind: "image",
            title: "库里的林薇",
            data: { serverUrl: "/api/reference-assets/token-1", storageKey: "token-1", width: 512, height: 768 },
        });

        expect(patch.references[0].url).toBe("/api/reference-assets/token-1");
        expect(patch.references[0].source).toBe("library");
        expect(patch.references[0].role).toBe("primary");
        expect(patch.primaryReferenceId).toBe(patch.references[0].id);
        // 旧主图降级为 history，不丢
        expect(patch.references[1]).toMatchObject({ id: "r1", role: "history" });
        expect(patch.references[2]).toMatchObject({ id: "r2" });
        expect(patch.referenceStorageKey).toBe("token-1");
    });

    it("back-fills library visual details without overwriting the user's own values", () => {
        const patch = buildOneClickLibraryApply(asset({ references: [ref("r1")], primaryReferenceId: "r1", appearance: "用户手写的外貌" }), {
            id: "lib-1",
            kind: "image",
            title: "库图",
            metadata: { appearance: "库里的外貌", polishedPrompt: "库里的提示词" },
            data: { serverUrl: "/api/reference-assets/token-1", storageKey: "token-1" },
        });

        // 用户已填的字段优先，不被库条目覆盖
        expect(patch.appearance).toBeUndefined();
        // 资产上为空的字段才回填
        expect(patch.polishedPrompt).toBe("库里的提示词");
    });

    it("rejects non-image entries and entries without a usable url", () => {
        const source = asset({ references: [ref("r1")], primaryReferenceId: "r1" });
        expect(() => buildOneClickLibraryApply(source, { id: "lib-1", kind: "text", title: "文本素材" })).toThrow("只能取用图片类素材");
        expect(() => buildOneClickLibraryApply(source, { id: "lib-1", kind: "image", title: "无图", data: {} })).toThrow("没有可用的图片地址");
        // blob: 是临时地址，不能落库
        expect(() => buildOneClickLibraryApply(source, { id: "lib-1", kind: "image", title: "临时", data: { serverUrl: "blob:whatever" } })).toThrow("没有可用的图片地址");
    });
});
