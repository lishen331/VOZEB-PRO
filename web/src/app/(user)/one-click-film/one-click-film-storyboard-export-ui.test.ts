import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspacePath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-project.tsx");
const exportLibPath = resolve(process.cwd(), "src/lib/drama-lab-storyboard-export.ts");

/**
 * 分镜导出对应 L 的「导出分镜表excel」与「导出解说 SRT」
 * （FilmCreate.vue: onExportStoryboardSheet / onExportNarrationSrt，均放在 §4 顶部）。
 */
describe("one-click-film storyboard export UI", () => {
    it("exposes both export entries with L's labels", async () => {
        const source = await readFile(workspacePath, "utf8");
        expect(source).toContain('aria-label="导出分镜表excel"');
        expect(source).toContain('aria-label="导出解说 SRT"');
        expect(source).toContain('void exportStoryboard("xlsx")');
        expect(source).toContain('void exportStoryboard("srt")');
    });

    it("only offers export once the episode has shots", async () => {
        const source = await readFile(workspacePath, "utf8");
        expect(source).toContain("project.episodes[0]?.shots.length ?");
    });

    it("reuses the shared export builders instead of hand-rolling a format", async () => {
        const source = await readFile(workspacePath, "utf8");
        expect(source).toContain("buildStoryboardNarrationSrt");
        expect(source).toContain("buildStoryboardXlsx");
        expect(source).toContain("storyboardExportFilename");
    });

    it("keeps the shared export module free of drama-lab coupling", async () => {
        // 复用前提：该模块不含教学版的模块开关/协作/阶段判断，否则商单链路会被教学版规则拦住
        const lib = await readFile(exportLibPath, "utf8");
        expect(lib).not.toContain("featureModule");
        expect(lib).not.toContain("collaboration");
        expect(lib).not.toContain("assertDramaLabStageAllowed");
    });

    it("passes assets so the sheet can resolve scene/character/prop names", async () => {
        const source = await readFile(workspacePath, "utf8");
        expect(source).toContain("scenes: project.scenes");
        expect(source).toContain("characters: project.characters");
        expect(source).toContain("props: project.props");
    });
});
