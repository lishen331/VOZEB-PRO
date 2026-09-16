import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
describe("asset history gallery", () => {
    it("keeps a non-shrinking thumbnail row and exposes the complete gallery", () => {
        expect(source).toContain('aria-label="更多历史参考图"');
        expect(source).toContain('aria-label="全部历史参考图"');
        expect(source).toContain("historyAssetId");
        expect(source).toContain("overflow-y-auto");
        expect(source).toContain("references.slice(0, 3)");
    });
});
