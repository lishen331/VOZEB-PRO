import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama workflow lab isolation", () => {
    it("gates both lab routes behind the runtime flag", async () => {
        const [homeRoute, projectRoute] = await Promise.all([readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/page.tsx"), "utf8"), readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/page.tsx"), "utf8")]);

        for (const source of [homeRoute, projectRoute]) {
            expect(source).toContain("isDramaWorkflowLabEnabled");
            expect(source).toContain("notFound()");
        }
    });

    it("keeps the first lab surface read-only", async () => {
        const [home, project] = await Promise.all([
            readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/drama-workflow-lab-home.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project.tsx"), "utf8"),
        ]);
        const source = `${home}\n${project}`;

        expect(source).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
        expect(source).not.toContain("createDramaProject");
        expect(source).not.toContain("saveDramaProject");
        expect(source).toContain("/api/drama/projects");
    });
});
