import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("school project billing badge", () => {
    it("only renders a public billing summary for linked production projects", async () => {
        const source = await readFile(resolve(process.cwd(), "src/components/school/school-project-billing-badge.tsx"), "utf8");
        expect(source).toContain("getSchoolProjectBilling");
        expect(source).toContain("学校");
        expect(source).toContain("小组算力");
        expect(source).toContain("预计扣费来源");
        expect(source).toContain("open-source-practice");
        expect(source).toContain("return null");
        expect(source).not.toContain("ledgerId");
        expect(source).not.toContain("idempotencyKey");
    });
});
