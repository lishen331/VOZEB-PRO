import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin official work editor contract", () => {
    it("offers official creation, source filtering, responsive editing, sorting, covers, drafts, and publish confirmation", async () => {
        const section = await readFile(resolve(process.cwd(), "src/app/admin/works/components/admin-works-section.tsx"), "utf8");
        const editor = await readFile(resolve(process.cwd(), "src/app/admin/works/components/admin-official-work-editor.tsx"), "utf8");
        const picker = await readFile(resolve(process.cwd(), "src/app/admin/works/components/admin-official-work-media-picker.tsx"), "utf8");
        expect(section).toContain("发布官方作品");
        expect(section).toContain("全部来源");
        expect(section).toContain("官方作品");
        expect(section).toContain("<AdminOfficialWorkEditor");
        expect(editor).toContain('width: "min(720px, 100vw)"');
        expect(editor).toContain("保存草稿");
        expect(editor).toContain("发布更新");
        expect(editor).toContain("发布后将立即进入作品广场");
        expect(editor).toContain("设为封面");
        expect(editor).toContain("上移");
        expect(editor).toContain("下移");
        expect(picker).toContain("listOfficialWorkMedia");
        expect(picker).not.toContain("pageSize: 1000");
    });
});
