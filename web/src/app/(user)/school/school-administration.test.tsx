import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("school administration", () => {
    it("uses the tenant API, fixed CSV columns and responsive management surfaces", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/school/school-administration.tsx"), "utf8");
        const csvSource = await readFile(resolve(process.cwd(), "src/app/(user)/school/school-csv.ts"), "utf8");
        expect(source).toContain("schoolApi");
        expect(source).not.toContain("fetch(");
        expect(csvSource).toContain('from "papaparse"');
        expect(csvSource).toContain('["username", "displayName", "password", "role"]');
        expect(source).toContain("学校资料");
        expect(source).toContain("成员管理");
        expect(source).toContain("班级管理");
        expect(source).toContain("size={Math.min(640");
        expect(source).toContain("<Modal forceRender");
        expect(source).toContain("forceRender\n                size={Math.min(640");
        expect(source).toContain("md:hidden");
        expect(source).toContain("hidden md:block");
    });

    it("enforces school manager access on the server page", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/school/page.tsx"), "utf8");
        expect(source).toContain("requireSchoolManager");
        expect(source).toContain('redirect("/create")');
    });
});
