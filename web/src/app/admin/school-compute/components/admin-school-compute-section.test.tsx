import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("admin school compute section", () => {
    it("exposes the school pool summary and guarded mutations", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/school-compute/components/admin-school-compute-section.tsx"), "utf8");
        expect(source).toContain("adminSchoolComputeApi.listPools");
        expect(source).toContain("adminSchoolComputeApi.getPool");
        expect(source).toContain("adminSchoolComputeApi.credit");
        expect(source).toContain("adminSchoolComputeApi.adjust");
        expect(source).toContain("adminSchoolComputeApi.setStatus");
        expect(source).toContain("education.manage");
        expect(source).toContain("billing.manage");
        expect(source).toContain("总额度");
        expect(source).toContain("可用额度");
        expect(source).toContain("已分配");
        expect(source).toContain("已消耗");
        expect(source).toContain("冻结算力池");
        expect(source).toContain("充值");
        expect(source).toContain("调账");
        expect(source).toContain('width="min(640px, 100vw)"');
    });
});
