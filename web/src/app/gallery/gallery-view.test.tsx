import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("GalleryView pull-film entry", () => {
    it("uses the shared gallery card and preview without loading process snapshots in the page", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/gallery/gallery-view.tsx"), "utf8");

        expect(source).toContain("<PublicWorkGalleryCard");
        expect(source).toContain("<PublicWorkPreviewModal");
        expect(source).not.toContain("pullFilmSnapshot");
        expect(source).not.toContain("getPublicWorkProcess");
    });
});
