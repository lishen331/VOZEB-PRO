import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("canvas upload limits", () => {
    it("rejects oversized files before uploading or creating nodes", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/canvas/[id]/use-canvas-media-session-actions.tsx"), "utf8");

        expect(source).toContain("creativeUploadMaxBytes");
        expect(source).toContain("creativeUploadLimitMessage");
        expect(source).toContain("file.size > creativeUploadMaxBytes(uploadType)");
    });
});
