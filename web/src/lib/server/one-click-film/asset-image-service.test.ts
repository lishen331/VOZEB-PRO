import { describe, expect, it } from "vitest";
import type { DramaNamedAsset, DramaProject } from "@/lib/drama-project-contract";
import { OneClickAssetImageError, buildOneClickAssetImageRequest, findOneClickAsset, resolveOneClickAssetLayout } from "./asset-image-service";

/**
 * 基线：L 的 `generate-image` / `generate-four-view-image`，
 * 版式与参考图选取规则与创作工坊资产面板一致。
 */
function asset(extra: Partial<DramaNamedAsset> = {}): DramaNamedAsset {
    return { id: "a1", name: "林薇", description: "女主", ...extra } as DramaNamedAsset;
}

function project(assets: { characters?: DramaNamedAsset[]; scenes?: DramaNamedAsset[]; props?: DramaNamedAsset[] } = {}): DramaProject {
    return {
        id: "p1",
        title: "商单短剧",
        style: "电影感国漫",
        ratio: "9:16",
        characters: assets.characters || [],
        scenes: assets.scenes || [],
        props: assets.props || [],
        clues: [],
        episodes: [],
    } as unknown as DramaProject;
}

const ref = (id: string, url: string) => ({ id, url, source: "upload" as const, label: id, createdAt: "2026-09-01T00:00:00.000Z" });

describe("one-click-film asset image request (L parity)", () => {
    it("forces four-view for characters and defaults others to single", () => {
        expect(resolveOneClickAssetLayout("characters", asset(), "single")).toBe("four_view");
        expect(resolveOneClickAssetLayout("scenes", asset())).toBe("single");
        expect(resolveOneClickAssetLayout("props", asset())).toBe("single");
        // 场景/道具可显式切四格
        expect(resolveOneClickAssetLayout("scenes", asset(), "four_view")).toBe("four_view");
        // 资产自身设置优先于默认
        expect(resolveOneClickAssetLayout("props", asset({ generationLayout: "four_view" }))).toBe("four_view");
    });

    it("uses only existing references for characters", () => {
        const target = asset({ polishedPrompt: "角色四视图提示词", references: [ref("r1", "https://cdn/a.png"), ref("r2", "https://cdn/b.png")], primaryReferenceId: "r2" });
        const prepared = buildOneClickAssetImageRequest(project({ characters: [target] }), "characters", target);

        expect(prepared.layout).toBe("four_view");
        expect(prepared.prompt).toBe("角色四视图提示词");
        // 角色不把主图重复插到最前，保持原有参考图顺序
        expect(prepared.references.map((item) => item.id)).toEqual(["r1", "r2"]);
    });

    it("puts the primary reference first for scenes and props, de-duplicated", () => {
        const target = asset({ polishedPrompt: "场景提示词", references: [ref("r1", "https://cdn/a.png"), ref("r2", "https://cdn/b.png")], primaryReferenceId: "r2" });
        const prepared = buildOneClickAssetImageRequest(project({ scenes: [target] }), "scenes", target);

        expect(prepared.references.map((item) => item.id)).toEqual(["r2", "r1"]);
        // 去重后不应出现重复 URL
        expect(new Set(prepared.references.map((item) => item.url)).size).toBe(prepared.references.length);
    });

    it("caps references at ten", () => {
        const many = Array.from({ length: 14 }, (_, index) => ref(`r${index}`, `https://cdn/${index}.png`));
        const target = asset({ polishedPrompt: "道具提示词", references: many, primaryReferenceId: "r0" });
        expect(buildOneClickAssetImageRequest(project({ props: [target] }), "props", target).references).toHaveLength(10);
    });

    it("refuses to generate without a usable prompt", () => {
        const bare = { id: "a1", name: "", description: "" } as DramaNamedAsset;
        expect(() => buildOneClickAssetImageRequest(project({ props: [bare] }), "props", bare)).toThrow(OneClickAssetImageError);
    });

    it("reports a missing asset as 404", () => {
        try {
            findOneClickAsset(project(), "characters", "nope");
            throw new Error("should have thrown");
        } catch (error) {
            expect(error).toBeInstanceOf(OneClickAssetImageError);
            expect((error as OneClickAssetImageError).status).toBe(404);
        }
    });
});
