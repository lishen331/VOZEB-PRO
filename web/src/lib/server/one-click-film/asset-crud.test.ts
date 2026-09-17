import { describe, expect, it } from "vitest";
import type { DramaNamedAsset, DramaProject, DramaShot } from "@/lib/drama-project-contract";
import { OneClickAssetCrudError, createOneClickAsset, deleteOneClickAsset, updateOneClickAsset } from "./asset-crud";

/**
 * 资产手工增删改。L 的资产名称在项目内唯一（提取时靠名称去重），
 * 删除时必须同步清掉分镜绑定，否则会留下幽灵资产引用（规范 §8 禁止）。
 */
function asset(id: string, name: string, extra: Partial<DramaNamedAsset> = {}): DramaNamedAsset {
    return { id, name, description: "", references: [], ...extra } as DramaNamedAsset;
}

function shot(extra: Partial<DramaShot> = {}): DramaShot {
    return {
        id: "s1",
        order: 1,
        title: "镜头1",
        description: "",
        sourceText: "",
        shotBoundary: "",
        dialogue: "",
        narration: "",
        utterances: [],
        imagePrompt: "",
        videoPrompt: "",
        cameraMotion: "",
        duration: 3,
        characterIds: [],
        propIds: [],
        clueIds: [],
        ...extra,
    };
}

function project(extra: Partial<DramaProject> = {}): DramaProject {
    return {
        id: "p1",
        characters: [],
        scenes: [],
        props: [],
        clues: [],
        episodes: [{ id: "e1", shots: [] }],
        ...extra,
    } as unknown as DramaProject;
}

describe("one-click-film asset CRUD", () => {
    it("creates a character defaulting to four-view", () => {
        const { project: next, asset: created } = createOneClickAsset(project(), "characters", { name: "林薇", description: "女主" });
        expect(next.characters).toHaveLength(1);
        expect(created.name).toBe("林薇");
        expect(created.description).toBe("女主");
        // L：角色固定四视图
        expect(created.generationLayout).toBe("four_view");
        expect(created.references).toEqual([]);
    });

    it("creates scenes and props defaulting to single layout", () => {
        expect(createOneClickAsset(project(), "scenes", { name: "车站" }).asset.generationLayout).toBe("single");
        expect(createOneClickAsset(project(), "props", { name: "手机" }).asset.generationLayout).toBe("single");
    });

    it("trims the name and rejects an empty one", () => {
        expect(createOneClickAsset(project(), "props", { name: "  手机  " }).asset.name).toBe("手机");
        expect(() => createOneClickAsset(project(), "props", { name: "   " })).toThrow("名称不能为空");
    });

    it("rejects duplicate names to avoid ghost anchors", () => {
        const source = project({ characters: [asset("a1", "林薇")] });
        try {
            createOneClickAsset(source, "characters", { name: "林薇" });
            throw new Error("should have thrown");
        } catch (error) {
            expect(error).toBeInstanceOf(OneClickAssetCrudError);
            expect((error as OneClickAssetCrudError).status).toBe(409);
        }
    });

    it("only writes whitelisted fields and never touches references", () => {
        const source = project({ characters: [asset("a1", "林薇", { references: [{ id: "r1", url: "https://cdn/a.png", source: "upload", label: "r1", createdAt: "t" }], primaryReferenceId: "r1" })] });
        const { asset: updated } = updateOneClickAsset(source, "characters", "a1", {
            description: "改后描述",
            appearance: "圆脸短发",
            // 白名单外的字段必须忽略
            id: "hacked",
            references: [],
            primaryReferenceId: undefined,
        } as never);

        expect(updated.description).toBe("改后描述");
        expect(updated.appearance).toBe("圆脸短发");
        expect(updated.id).toBe("a1");
        // 参考图状态由参考图链路独占维护
        expect(updated.references).toHaveLength(1);
        expect(updated.primaryReferenceId).toBe("r1");
    });

    it("rejects renaming onto an existing name but allows keeping its own", () => {
        const source = project({ characters: [asset("a1", "林薇"), asset("a2", "陈默")] });
        expect(() => updateOneClickAsset(source, "characters", "a2", { name: "林薇" })).toThrow("已存在同名资产");
        expect(updateOneClickAsset(source, "characters", "a1", { name: "林薇" }).asset.name).toBe("林薇");
    });

    it("clears shot bindings when an asset is deleted", () => {
        const source = project({
            characters: [asset("c1", "林薇"), asset("c2", "陈默")],
            props: [asset("p1", "手机")],
            scenes: [asset("s1", "车站")],
            episodes: [{ id: "e1", shots: [shot({ characterIds: ["c1", "c2"], propIds: ["p1"], sceneId: "s1" })] }] as never,
        });

        const afterCharacter = deleteOneClickAsset(source, "characters", "c1");
        expect(afterCharacter.characters.map((item) => item.id)).toEqual(["c2"]);
        // 规范禁止幽灵资产引用
        expect(afterCharacter.episodes[0].shots[0].characterIds).toEqual(["c2"]);

        expect(deleteOneClickAsset(source, "props", "p1").episodes[0].shots[0].propIds).toEqual([]);
        expect(deleteOneClickAsset(source, "scenes", "s1").episodes[0].shots[0].sceneId).toBeUndefined();
    });

    it("reports a missing asset as 404", () => {
        expect(() => updateOneClickAsset(project(), "characters", "nope", {})).toThrow("资产不存在");
        expect(() => deleteOneClickAsset(project(), "characters", "nope")).toThrow("资产不存在");
    });

    it("does not mutate the input project", () => {
        const source = project({ characters: [asset("a1", "林薇")], episodes: [{ id: "e1", shots: [shot({ characterIds: ["a1"] })] }] as never });
        const snapshot = structuredClone(source);
        createOneClickAsset(source, "characters", { name: "陈默" });
        updateOneClickAsset(source, "characters", "a1", { description: "x" });
        deleteOneClickAsset(source, "characters", "a1");
        expect(source).toEqual(snapshot);
    });
});
