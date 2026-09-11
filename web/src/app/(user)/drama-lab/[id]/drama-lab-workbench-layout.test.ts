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
    it("uses available card width rather than viewport width for the three-column layout", async () => {
        const source = await readFile(path, "utf8");
        expect(source).toContain('className="@container/storyboard min-w-0');
        expect(source).toContain("@min-[60rem]/storyboard:grid-cols-[280px_minmax(0,1fr)_minmax(300px,0.9fr)]");
        expect(source).not.toContain("xl:grid-cols-[280px_minmax(0,1fr)_minmax(300px,0.9fr)]");
        expect(source).toContain('className="min-w-0 space-y-4 p-4" aria-label={`分镜 ${shot.shotNumber} 资产关联`}');
    });
    it("exposes classic upload via the existing key-frame flow and aligns media above editors", async () => {
        const source = await readFile(path, "utf8");
        expect(source).toContain('aria-label="上传分镜图"');
        expect(source).toContain('onUploadFrame(shot, "key", file)');
        expect(source).toContain("const classicImageUrl = shot.frames?.key?.url || shot.storyboardImageUrl");
        expect(source).toContain('data-storyboard-media="image"');
        expect(source).toContain('data-storyboard-media="video"');
        expect(source).toContain("查看 / 编辑分镜图提示词");
        expect(source).toContain("查看 / 编辑视频提示词");
        expect(source).toContain("上传{frameLabel[frameType]}");
        expect(source).toContain("const [promptEditor, setPromptEditor]");
        expect(source).toContain("function PromptPreview(");
        expect(source).not.toContain('<details open className="space-y-2">');
        expect(source).toContain('key: { ...(shot.frames?.key || { prompt: "" }), url, status: "success", source: "restored"');
        expect(source).toContain('{classicImageUrl ? "重新生成分镜图" : "生成分镜图"}');
    });
    it("keeps first-last controls scoped to first-last mode and media controls outside textareas", async () => {
        const source = await readFile(path, "utf8");
        expect(source).toContain("{isFirstLast\n                            ? ([");
        expect(source).toContain("aria-label={`上传${frameLabel[frameType]}`}");
        expect(source).toContain('aria-label="选择分镜图文件"');
        expect(source).toContain("onClick={() => uploadInputRefs.current.key?.click()}");
        expect(source).toContain('data-storyboard-media="image"');
        expect(source).toContain('data-storyboard-media="video"');
    });
    it("supports per-shot collapse without removing task and canvas controls", async () => {
        const source = await readFile(path, "utf8");
        expect(source).toContain("collapsedShots");
        expect(source).toContain("收起分镜");
        expect(source).toContain("展开分镜");
        expect(source).toContain("onToggleCollapse");
        expect(source).toContain("hidden={collapsed}");
        expect(source).toContain("aria-expanded={!collapsed}");
        expect(source).not.toContain("{!collapsed ? (");
        expect(source).toContain("window.addEventListener(DRAMA_LAB_SHOT_FOCUS, reveal)");
    });
    it("retains advanced shot fields when creating and editing", async () => {
        const source = await readFile(path, "utf8");
        for (const field of ["lightingStyle", "depthOfField", "segmentIndex", "segmentTitle", "layoutDescription", "action", "result", "startFramePrompt", "endFramePrompt", "universalSegmentText"]) expect(source).toContain(field);
        expect(source).toMatch(/const newShot: Shot = \{\s*\.\.\.details,/);
    });
    it("exposes named shot configuration and insertion without changing the canvas route", async () => {
        const source = await readFile(path, "utf8");
        expect(source).toContain("分镜配置");
        expect(source).toContain("onInsertBefore");
        expect(source).toContain("dramaLabEpisodeCanvasHref(project.id, shot.episodeId, shot.id)");
    });
    it("exposes universal prompt generation and polishing controls", async () => {
        const source = await readFile(path, "utf8");
        expect(source).toContain('import { optimizePrompt } from "@/services/api/prompt-optimization"');
        expect(source).toContain("handleUniversalPromptAction");
        expect(source).toContain("生成全能提示词");
        expect(source).toContain("润色全能提示词");
        expect(source).toContain("universalSegmentText: optimizedPrompt");
    });
    it("keeps classic, first-last, and universal storyboard panels mutually exclusive", async () => {
        const source = await readFile(path, "utf8");
        expect(source).toContain('const isUniversal = shot.creationMode === "universal"');
        expect(source).toContain('const isFirstLast = !isUniversal && storyboardFrameMode === "first_last"');
        expect(source).toContain("const isClassic = !isUniversal && !isFirstLast");
        expect(source).toContain("universalReferences");
        expect(source).not.toContain("segmentCollapsed");
    });
});
