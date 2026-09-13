import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("character anchor display labels", () => {
    it("shows bilingual keys while preserving canonical stored keys", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        for (const label of ["face_shape（脸型）", "facial_features（五官特征）", "unique_marks（独特标记）", "color_anchors（颜色锚点）", "skin_texture（皮肤质感）", "hair_style（发型）"]) expect(source).toContain(label);
        expect(source).toContain("parseCharacterIdentityAnchors");
    });
});
