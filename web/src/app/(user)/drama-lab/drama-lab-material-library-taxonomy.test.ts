import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("drama lab material library taxonomy", () => {
    it("filters the material library by category", async () => {
        const source = await readFile(new URL("./drama-lab-material-library-modal.tsx", import.meta.url), "utf8");

        expect(source).toContain('const [category, setCategory] = useState("")');
        expect(source).toContain("category, dramaAssetType: type");
        expect(source).toContain("<Select");
        expect(source).toContain('placeholder="全部分类"');
        expect(source).toContain("categoryOptions");
        expect(source).not.toContain('<Input`r`n                        allowClear`r`n                        className="max-w-44"');
    });

    it("does not inject category into the image-generation prompt", async () => {
        const source = await readFile(new URL("./drama-lab-material-library-modal.tsx", import.meta.url), "utf8");
        const prompt = source.slice(source.indexOf("const prompt = ["), source.indexOf(".filter(Boolean)", source.indexOf("const prompt = [")));

        expect(prompt).toContain("editor.note.trim()");
        expect(prompt).not.toContain("editor.category.trim()");
        expect(prompt).not.toContain("分类：");
    });

    it("does not turn tags into a project asset description", async () => {
        const source = await readFile(new URL("./[id]/drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");

        expect(source).toContain('description: libraryAsset.note || ""');
        expect(source).not.toContain('description: libraryAsset.note || libraryAsset.tags.join("、")');
    });
});
