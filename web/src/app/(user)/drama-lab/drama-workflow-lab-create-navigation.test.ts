import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama create workspace navigation", () => {
    it("returns to the project outline and supports storyboard navigation", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx"), "utf8");

        expect(source).toContain('href={`/drama-lab/${encodeURIComponent(projectId)}/outline`}');
        expect(source).toContain('style={{ height: "calc(100vh - 212px)" }}');
        expect(source).toContain('setActiveStep("storyboard")');
        expect(source).toContain('document.getElementById(`storyboard-shot-${shot.id}`)?.scrollIntoView');
        expect(source).toContain('id={`storyboard-shot-${shot.id}`}');
    });
});
