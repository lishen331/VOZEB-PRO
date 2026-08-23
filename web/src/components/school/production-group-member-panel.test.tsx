import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("production group member panel", () => {
    it("limits teacher and student actions to the signed-in member", async () => {
        const source = await readFile(resolve(process.cwd(), "src/components/school/production-group-member-panel.tsx"), "utf8");
        expect(source).toContain("useSchoolContextStore");
        expect(source).toContain("schoolComputeApi.listTeachingGroups");
        expect(source).toContain("schoolComputeApi.listOwnAdvances");
        expect(source).toContain("schoolComputeApi.createPersonalAdvance");
        expect(source).toContain("schoolComputeApi.requestAllocation");
        expect(source).toContain("临时补充小组算力");
        expect(source).toContain("仅使用个人永久积分");
        expect(source).toContain("追加申请");
        expect(source).toContain("pending_school_confirmation");
        expect(source).toContain('width="min(640px, 100vw)"');
        expect(source).not.toContain("listPersonalAdvances");
    });
});
