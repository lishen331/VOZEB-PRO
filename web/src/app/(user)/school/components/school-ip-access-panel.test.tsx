import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("school IP access panel", () => {
    it("shows grant facts and only changes the whole-package switch", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/school/components/school-ip-access-panel.tsx"), "utf8");
        expect(source).toContain("schoolIpLibraryApi.list");
        expect(source).toContain("schoolIpLibraryApi.updateMemberAccess");
        expect(source).toContain("校内开放");
        expect(source).toContain("授权类型");
        expect(source).toContain("授权有效期");
        expect(source).toContain("Switch");
        expect(source).not.toContain("schoolId");
    });
});
