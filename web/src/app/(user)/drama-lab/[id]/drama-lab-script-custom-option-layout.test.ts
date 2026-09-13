import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("script custom option layout", () => {
    it("places custom option editor before autosave status in the same controls flow", async () => {
        const source = await readFile(new URL("./drama-workflow-lab-project-complete.tsx", import.meta.url), "utf8");
        const custom = source.indexOf('aria-label={customOptionKind === "style" ? "添加自定义剧本风格"');
        const saveStatus = source.indexOf('aria-live="polite"');
        expect(custom).toBeGreaterThan(-1);
        expect(saveStatus).toBeGreaterThan(-1);
        expect(custom).toBeLessThan(saveStatus);
    });
});
