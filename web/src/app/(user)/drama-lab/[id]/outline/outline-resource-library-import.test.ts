import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("drama outline resource-library import", () => {
    it("uses the shared compact picker and queries all image assets", async () => {
        const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
        expect(source).toContain("DramaLabAssetLibraryPicker");
        expect(source).not.toContain("dramaAssetType: type");
        expect(source).not.toContain("List.Item.Meta");
        expect(source).toContain("importedNames");
    });

    it("keeps the detail-page picker open after an import", async () => {
        const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
        expect(source).toContain("onClose={() => setResourceImportOpen(false)}");
        expect(source).not.toContain("setResourceImportOpen(false);\n        } catch");
    });
});
