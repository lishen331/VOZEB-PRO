import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

describe("one-click film entry", () => {
    it("uses real V project APIs", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/one-click-film/one-click-film-home.tsx"), "utf8");
        expect(source).toContain("/api/one-click-film/projects");
        expect(source).toContain('method: "POST"');
        expect(source).toContain("/one-click-film/");
        expect(source).not.toContain("示例项目");
    });
    it("loads detail and opens the platform canvas", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-project.tsx"), "utf8");
        expect(source).toContain("/api/one-click-film/projects/${encodeURIComponent(projectId)}");
        expect(source).toContain("/one-click-film/${encodeURIComponent(projectId)}/canvas");
    });
});
