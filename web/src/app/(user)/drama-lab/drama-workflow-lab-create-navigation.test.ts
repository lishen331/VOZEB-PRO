import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama create workspace navigation", () => {
    it("returns to the project outline and provides an expandable episode storyboard tree", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx"), "utf8");

        expect(source).toContain("href={`/drama-lab/${encodeURIComponent(projectId)}/outline`}");
        expect(source).toContain("const [expandedEpisodeIds, setExpandedEpisodeIds] = useState<Set<string>>(new Set())");
        expect(source).toContain("const toggleEpisodeExpanded = (episodeId: string) =>");
        expect(source).toContain('aria-label={sidebarCollapsed ? "展开剧集侧栏" : "收起剧集侧栏"}');
        expect(source).toContain('aria-label="新增剧集"');
        expect(source).toContain('setActiveStep("storyboard")');
        expect(source).toContain("document.getElementById(`storyboard-shot-${shot.id}`)?.scrollIntoView");
        expect(source).toContain("id={`storyboard-shot-${shot.id}`}");
        expect(source).toContain("shots: nextProject.shots");
        expect(source.indexOf('{ key: "assets", label: "资产准备", icon: Users }')).toBeGreaterThan(source.indexOf('{ key: "script", label: "剧本", icon: FileText }'));
        expect(source.indexOf('{ key: "review", label: "内容审核", icon: FileText }')).toBeGreaterThan(source.indexOf('{ key: "storyboard", label: "分镜工作台", icon: Film }'));
        expect(source.indexOf('{ key: "export", label: "成片导出", icon: Download }')).toBeGreaterThan(source.indexOf('{ key: "review", label: "内容审核", icon: FileText }'));
    });
});
