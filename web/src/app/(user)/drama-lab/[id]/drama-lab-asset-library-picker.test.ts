import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("drama asset library picker", () => {
    it("uses a compact L-like import row without description text", async () => {
        const source = await readFile(new URL("./drama-lab-asset-library-picker.tsx", import.meta.url), "utf8");
        expect(source).toContain("从素材库导入");
        expect(source).toContain("已导入");
        expect(source).toContain("asset.title");
        expect(source).toContain("共");
        expect(source).not.toContain("List.Item.Meta");
        expect(source).not.toContain("asset.note");
    });

    it("keeps the picker open after import", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).not.toContain("messageApi.success(`已从素材库添加${definition.label}：${libraryAsset.title}`);\n            setLibraryOpen(false);");
    });
});
