import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
describe("创作工坊插件子功能入口", () => {
    it("renders the subfeature modal when the 创作工坊 card is selected", async () => {
        const source = await readFile(new URL("./admin-upstream-sections.tsx", import.meta.url), "utf8");
        expect(source).toContain('plugin.id === "drama-lab"');
        expect(source).not.toContain("{false ? (");
        expect(source).toContain("/admin/drama-lab-features");
    });
});
