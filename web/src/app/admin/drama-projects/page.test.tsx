import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin drama project filters", () => {
    it("wraps mobile filters and lets the title search shrink without hiding actions", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/drama-projects/page.tsx"), "utf8");
        expect(source).toContain('className="mb-4 flex min-w-0 flex-wrap gap-2"');
        expect(source).toContain('rootClassName="w-full min-w-0 sm:w-[300px]"');
        expect(source).not.toContain("style={{ width: 300 }}");
        expect(source).toContain('placeholder="状态筛选"');
        expect(source).toContain("onPressEnter={fetchProjects}");
        expect(source).toContain("onClick={fetchProjects}");
        expect(source).toContain("搜索");
    });
});
