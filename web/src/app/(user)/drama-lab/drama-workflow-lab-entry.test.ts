import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama workflow lab isolation", () => {
    it("gates the lab entry route behind the runtime flag", async () => {
        const [homeRoute, projectRoute] = await Promise.all([readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/page.tsx"), "utf8"), readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/page.tsx"), "utf8")]);

        expect(homeRoute).toContain("isDramaWorkflowLabEnabled");
        expect(homeRoute).toContain("notFound()");
        expect(projectRoute).toContain("redirect(`/drama-lab/");
        expect(projectRoute).toContain("/outline`");
    });

    it("creates a drama before entering the adapted workspace", async () => {
        const [home, project] = await Promise.all([
            readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/drama-workflow-lab-home.tsx"), "utf8"),
            readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project.tsx"), "utf8"),
        ]);
        const source = `${home}\n${project}`;

        expect(home).toContain('method: "POST"');
        expect(home).toContain('fetch("/api/drama-lab/projects"');
        expect(home).toContain("window.location.assign(`/drama-lab/");
        expect(project).toContain("/api/drama-lab/projects/${encodeURIComponent(projectId)}");
        expect(project).toContain("打开制作编辑器");
        expect(project).not.toMatch(/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/i);
        expect(source).toContain("/api/drama-lab/projects");
    });
});
