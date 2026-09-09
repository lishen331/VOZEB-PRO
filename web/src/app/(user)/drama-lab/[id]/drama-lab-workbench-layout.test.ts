import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
const path = "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx";
describe("production storyboard workbench layout wiring", () => {
    it("keeps configuration above generation actions and asset selection compact", async () => {
        const source = await readFile(path, "utf8");
        const panel = source.slice(source.indexOf('aria-label="分镜工作台模块"'));
        expect(panel.indexOf("<DramaLabStoryboardConstraints")).toBeGreaterThan(-1);
        expect(panel.indexOf("<DramaLabStoryboardConstraints")).toBeLessThan(panel.indexOf('aria-label="分镜操作"'));
        expect(source).toContain("<DramaLabShotAssetPicker");
        expect(source).not.toContain("function AssetBindingGroup(");
    });
    it("exposes named shot configuration and insertion without changing the canvas route", async () => {
        const source = await readFile(path, "utf8");
        expect(source).toContain("分镜配置");
        expect(source).toContain("onInsertBefore");
        expect(source).toContain("dramaLabEpisodeCanvasHref(project.id, shot.episodeId, shot.id)");
    });
});
