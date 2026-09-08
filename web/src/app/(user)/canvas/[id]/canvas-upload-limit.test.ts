import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("canvas upload limits", () => {
    it("rejects oversized files before uploading or creating nodes", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/canvas/[id]/use-canvas-media-session-actions.tsx"), "utf8");

        expect(source).toContain("const CANVAS_UPLOAD_MAX_BYTES = 20 * 1024 * 1024");
        expect(source).toContain("画布单个文件不能超过 20MB");
        expect(source).toContain("file.size > CANVAS_UPLOAD_MAX_BYTES");
    });
});
