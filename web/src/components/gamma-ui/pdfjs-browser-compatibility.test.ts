import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("PDF.js browser compatibility", () => {
    it("ships a PDF.js runtime that does not require the newer Map.getOrInsertComputed API", async () => {
        const packageRoot = resolve(process.cwd(), "node_modules/pdfjs-dist");
        const [metadata, main, worker] = await Promise.all([
            readFile(resolve(packageRoot, "package.json"), "utf8").then((content) => JSON.parse(content) as { version: string }),
            readFile(resolve(packageRoot, "build/pdf.mjs"), "utf8"),
            readFile(resolve(packageRoot, "build/pdf.worker.mjs"), "utf8"),
        ]);

        expect(metadata.version).toMatch(/^5\./);
        expect(main).not.toMatch(/\.getOrInsertComputed\s*\(/);
        expect(worker).not.toMatch(/\.getOrInsertComputed\s*\(/);
    });
});
