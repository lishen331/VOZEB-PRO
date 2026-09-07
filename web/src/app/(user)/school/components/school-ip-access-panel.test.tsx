import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("school IP access panel", () => {
    it("shows direct child-IP grants without a school-side access switch", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/school/components/school-ip-access-panel.tsx"), "utf8");
        expect(source).toContain("schoolIpLibraryApi.list");
        expect(source).not.toContain("schoolIpLibraryApi.updateMemberAccess");
        expect(source).toContain("有效授权会直接提供给管理员、教师和学生");
        expect(source).toContain("授权类型");
        expect(source).toContain("授权有效期");
        expect(source).toContain("IP 已停用");
        expect(source).not.toContain("schoolId");
    });
});
