import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Practice panorama viewer", () => {
    it("passes the original 2:1 source to the shared panorama surface like the Demo viewer", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/practice/components/practice-panorama-viewer.tsx"), "utf8");
        expect(source).not.toContain("imagePreviewUrl");
        expect(source).toContain('<CanvasPanoramaSurface src={url} alt="360°全景图" />');
        expect(source).toContain("children?: ReactNode");
        expect(source).toContain('role="button"');
    });
});
