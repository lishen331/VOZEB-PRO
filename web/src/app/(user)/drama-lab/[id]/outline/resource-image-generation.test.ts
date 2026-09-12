import { describe, expect, it } from "vitest";
import { buildResourceImageRequest, normalizeResourceGenerationReferences } from "./resource-image-generation";

describe("outline resource image generation", () => {
    it("routes text-only, image-only and text-plus-image inputs", () => {
        expect(buildResourceImageRequest("一只猫", [])).toMatchObject({ mode: "text-to-image", prompt: "一只猫", references: [] });
        expect(buildResourceImageRequest("", [{ id: "r1", url: "/a.png" }])).toMatchObject({ mode: "image-to-image", references: [{ id: "r1" }] });
        expect(buildResourceImageRequest("保留 @图1 的脸", [{ id: "r1", url: "/a.png" }])).toMatchObject({ mode: "text-image-to-image", prompt: "保留 @图1 的脸" });
    });

    it("limits generation references to nine and numbers them deterministically", () => {
        const refs = Array.from({ length: 11 }, (_, index) => ({ id: `r${index}`, url: `/${index}.png` }));
        expect(normalizeResourceGenerationReferences(refs)).toHaveLength(9);
        expect(normalizeResourceGenerationReferences(refs).map((item) => item.label)).toEqual(["图1", "图2", "图3", "图4", "图5", "图6", "图7", "图8", "图9"]);
    });

    it("rejects an empty request", () => {
        expect(() => buildResourceImageRequest("", [])).toThrow("请输入提示词或添加参考图");
    });
});
