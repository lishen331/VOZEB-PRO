import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("HomeGallery pull-film entry", () => {
    it("marks process-enabled cards and opens the shared preview", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/home/home-gallery.tsx"), "utf8");

        expect(source).toContain("item.hasProcess");
        expect(source).toContain("制作流程");
        expect(source).toContain("<PublicWorkPreviewModal");
        expect(source).not.toContain("pullFilmSnapshot");
    });
});
