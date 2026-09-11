import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama lab visual assets", () => {
    it("routes affected-shot regeneration through the server-owned storyboard generation endpoint", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");

        expect(source).toContain("/generate-image?episodeId=${encodeURIComponent(shot.episodeId)}");
        expect(source).not.toContain("dramaLabShotPrompt(project, shot)");
    });

    it("serializes project writes and applies generated references to the latest asset state", async () => {
        const projectSource = await readFile(new URL("./drama-workflow-lab-project-complete.tsx", import.meta.url), "utf8");
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");

        expect(projectSource).toContain("const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));");
        expect(projectSource).toContain('typeof updatesOrUpdater === "function" ? updatesOrUpdater(current) : updatesOrUpdater');
        expect(source).toContain("return replaceAssets((current) => current.map((asset) => (asset.id === assetId ? { ...asset, ...patch } : asset)))");
    });
});

describe("extraction detail wiring", () => {
    it("exposes L-compatible layout and final prompt fields in the asset editor", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-lab-visual-assets-panel.tsx"), "utf8");
        expect(source).toContain("生成版式");
        expect(source).toContain("最终生图提示词");
        expect(source).toContain("normalizeDramaAssetGenerationLayout");
    });

    it("retains extracted visual fields in the persisted UI asset", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("...readDramaLabAssetVisualDetails(asset)");
        expect(source).toContain("buildDramaLabAssetImagePrompt(project, asset, kind)");
        expect(source).toContain("...readDramaLabAssetVisualDetails(libraryAsset.metadata)");
    });
});
describe("drama lab visual asset extraction actions", () => {
    it("offers one-click extraction before the type-specific action", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        const toolbar = source.slice(source.indexOf("tabBarExtraContent"), source.indexOf("items={(Object.keys(ASSET_META)"));

        expect(toolbar).toContain("一键提取");
        expect(toolbar).toContain("提取{definition.label}");
        expect(toolbar.indexOf("一键提取")).toBeLessThan(toolbar.indexOf("提取{definition.label}"));
    });

    it("keeps all three extraction types on the batch path and reports partial failures", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");

        expect(source).toContain("const extractAssetsForKind = async (assetKind: AssetKind)");
        expect(source).toContain('for (const assetKind of ["characters", "scenes", "props"] as const)');
        expect(source).toContain("部分资产提取失败");
        expect(source).toContain('busyKey === "extract:all"');
    });
});

describe("L-compatible character AI editor actions", () => {
    it("renders reference extraction, prompt regeneration, anchor extraction, and stage generation actions", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("AI 提取视觉特征");
        expect(source).toContain("重新生成提示词");
        expect(source).toContain("提炼视觉锚点");
        expect(source).toContain("AI 生成造型");
        expect(source).toContain("移除参考图");
    });
});
