import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("CreateInspirationGallery pull-film entry", () => {
    it("marks eligible inspiration works and delegates process access to the shared preview", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/create/components/create-inspiration-gallery.tsx"), "utf8");

        expect(source).toContain("item.hasProcess");
        expect(source).toContain("制作流程");
        expect(source).toContain("<PublicWorkPreviewModal");
        expect(source).not.toContain("pullFilmSnapshot");
    });
});
