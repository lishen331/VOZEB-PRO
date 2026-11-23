import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const cssPath = new URL("./multi-angle.module.css", import.meta.url);

describe("multi-angle active option styles", () => {
    it("renders the selected preset as a readable translucent option, not a white blank pill", async () => {
        const css = await readFile(cssPath, "utf8");
        expect(css).toMatch(/\.root\s+\.ptabActive\s*\{[^}]*color:\s*var\(--gm-blue\)\s*!important/s);
        expect(css).toMatch(/\.root\s+\.ptabActive\s*\{[^}]*background:\s*color-mix\(in\s+srgb,\s*var\(--gm-blue\)\s+\d+%,\s*transparent\)/s);
    });

    it("renders the selected batch as translucent so it cannot hide the option label", async () => {
        const css = await readFile(cssPath, "utf8");
        expect(css).toMatch(/\.root\s+\.batchActive\s*\{[^}]*background:\s*color-mix\(in\s+srgb,\s*var\(--gm-blue\)\s+\d+%,\s*transparent\)/s);
        expect(css).toMatch(/\.root\s+\.batchActive\s*\{[^}]*color:\s*var\(--gm-blue\)\s*!important/s);
    });
});
