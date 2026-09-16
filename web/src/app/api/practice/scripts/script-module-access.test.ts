import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routes = ["route.ts", "import/route.ts", "[id]/route.ts", "[id]/versions/route.ts", "[id]/stages/route.ts", "[id]/agent/route.ts", "[id]/agent/[operation]/apply/route.ts", "[id]/export/route.ts"];

describe("script practice module access", () => {
    it("checks the script switch in every public script route", async () => {
        for (const route of routes) {
            const source = await readFile(resolve(process.cwd(), "src/app/api/practice/scripts", route), "utf8");
            expect(source, route).toContain('requirePracticeAccess(user, "script")');
        }
    });
});
