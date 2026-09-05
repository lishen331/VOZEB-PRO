import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("IP content preview", () => {
    it("uses real text, image, audio and video previews from the controlled admin route", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/ip-library/components/ip-content-preview.tsx"), "utf8");
        expect(source).toContain("file.extractedText");
        expect(source).toContain("<img");
        expect(source).toContain("<audio");
        expect(source).toContain("<video");
        expect(source).toContain("adminIpLibraryApi.fileUrl");
        expect(source).not.toContain("library_assets");
    });
});
