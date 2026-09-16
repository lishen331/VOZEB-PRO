import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectWorkbenchPath = resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx");
const episodeCanvasRoutePath = resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/canvas/page.tsx");

describe("drama lab episode canvas navigation", () => {
    it("offers an isolated canvas entry for every episode and storyboard shot", async () => {
        const source = await readFile(projectWorkbenchPath, "utf8");

        expect(source).toContain("export function dramaLabEpisodeCanvasHref");
        expect(source).toContain('params.set("episodeId", episodeId)');
        expect(source).toContain('params.set("shotId", shotId)');
        expect(source).toContain("打开本集画布");
        expect(source).toContain('title="画布定位"');
        expect(source).not.toContain("打开${ep.title}画布");
        expect(source).toContain("assetType");
        expect(source).toContain("assetId");
        expect(source).toContain("dramaLabEpisodeCanvasHref(project.id, shot.episodeId, shot.id)");
    });

    it("resolves the episode canvas before forwarding the drama context to Canvas", async () => {
        const source = await readFile(episodeCanvasRoutePath, "utf8").catch(() => "");

        expect(source).toContain("episodeId");
        expect(source).toContain("shotId");
        expect(source).toContain("dramaProjectId");
        expect(source).toMatch(/(?:episode-canvas|getOrCreateDramaLabEpisodeCanvasForUser|resolveDramaLabEpisodeCanvas)/);
        expect(source).toMatch(/(?:router\.replace|redirect)\(/);
        expect(source).toMatch(/(?:data\.data\?\.project\?\.id|resolved\.project\.id)/);
    });
});
