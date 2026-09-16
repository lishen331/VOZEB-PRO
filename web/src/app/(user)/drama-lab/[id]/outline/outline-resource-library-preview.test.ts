import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("drama outline resource-library preview", () => {
    it("makes resource card images expandable without opening the editor", async () => {
        const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

        expect(source).toContain("Image as AntImage");
        expect(source).toContain("preview={{ src: assetImageUrl(asset) }}");
        expect(source).toContain("onClick={(event) => event.stopPropagation()}");
        expect(source).toContain("data-outline-resource-card={asset.id}");
        expect(source).toContain("data-outline-resource-preview");
    });
});
