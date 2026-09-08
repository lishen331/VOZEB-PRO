import { describe, expect, it } from "vitest";
import { buildImageTaskPrompt } from "./image-reference-prompt";

describe("buildImageTaskPrompt canvas reference roles", () => {
    const config = { systemPrompt: "", outputBackground: "opaque", outputMode: undefined };

    it("keeps the original canvas prompt unchanged when every reference is original", () => {
        expect(
            buildImageTaskPrompt({
                source: "canvas",
                prompt: "生成一张产品图",
                config,
                references: [{ id: "image-1" }],
                referenceRoles: { "image-1": ["original"] },
            }),
        ).toBe("生成一张产品图");
    });

    it("renders only the selected roles per reference and supports multiple roles", () => {
        const prompt = buildImageTaskPrompt({
            source: "canvas",
            prompt: "生成一张产品图",
            config,
            references: [{ id: "image-1" }, { id: "image-2" }],
            referenceRoles: {
                "image-1": ["identity", "clothing"],
                "image-2": ["original"],
            },
        });
        expect(prompt).toContain("参考图1用途：仅参考人物身份、脸部特征与五官比例；仅参考服装、穿着结构与材质细节");
        expect(prompt).not.toContain("参考图2用途");
        expect(prompt).toContain("生成一张产品图");
    });
});
