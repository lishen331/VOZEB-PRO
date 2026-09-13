import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("asset preparation character multi-reference generation", () => {
    it("submits up to nine character references while preserving the existing prompt chain", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("characterGenerationReferences");
        expect(source).toContain(".slice(0, 9)");
        expect(source).toContain("referenceRoles");
        expect(source).toContain("buildDramaLabAssetImagePrompt");
    });

    it("shows character primary and multi-reference controls above character fields", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("data-character-primary-image");
        expect(source).toContain("data-character-generation-references");
        expect(source).toContain("最多 9 张");
        expect(source).toContain("@图N");
    });

    it("does not inject role classification into the final image prompt", async () => {
        const source = await readFile(new URL("../../../../lib/drama-lab-asset-prompt-contract.ts", import.meta.url), "utf8");
        expect(source).not.toContain("asset.role && `角色身份：${asset.role}`");
    });
});
