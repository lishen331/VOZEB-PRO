import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin school members list", () => {
    it("uses the typed scoped API and a retry-safe adjustment modal", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/schools/components/admin-school-members-list.tsx"), "utf8");
        expect(source).toContain("adminEducationApi.listSchoolMembers");
        expect(source).toContain("adminEducationApi.adjustSchoolMemberPoints");
        expect(source).not.toContain("fetch(");
        expect(source).toContain("返回学校列表");
        expect(source).toContain("账号 ID");
        expect(source).toContain("InputNumber");
        expect(source).toContain("Segmented");
        expect(source).toContain("crypto.randomUUID");
        expect(source).toContain("停用账号当前不能生成");
        expect(source).toContain("requestSequence");
        expect(source).toContain("precision={2}");
        expect(source).toContain("Math.min(520");
    });
});
