import { describe, expect, it } from "vitest";
import { buildResourceImageRequest, createGeneratedPrimaryImage, highlightResourceMentions, normalizeResourceGenerationReferences } from "./resource-image-generation";

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

    it("persists generated primary and history roles without leaking them into generation references", () => {
        const next = createGeneratedPrimaryImage("/old.png", "old", [{ id: "r1", url: "/ref.png", role: "reference" }], { url: "/new.png", storageKey: "new-key" }, 123);
        expect(next.primaryReferenceId).toBe("generated-123");
        expect(next.references).toEqual([
            expect.objectContaining({ id: "generated-123", url: "/new.png", role: "primary", source: "generated" }),
            expect.objectContaining({ id: "history-123", url: "/old.png", role: "history" }),
            expect.objectContaining({ id: "r1", role: "reference" }),
        ]);
        expect(normalizeResourceGenerationReferences(next.references)).toEqual([expect.objectContaining({ id: "r1", label: "图1" })]);
    });

    it("renders escaped mention markup for visible highlighting", () => {
        expect(highlightResourceMentions("保留 @图2 的脸 <测试>")).toContain('<mark data-mention="图2">@图2</mark>');
        expect(highlightResourceMentions("保留 @图2 的脸 <测试>")).toContain("&lt;测试&gt;");
    });
    it("rejects an empty request", () => {
        expect(() => buildResourceImageRequest("", [])).toThrow("请输入提示词或添加参考图");
    });
});
