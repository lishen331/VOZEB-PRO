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
        expect(source).toContain("const updateAsset");
    });
});

describe("extraction detail wiring", () => {
    it("exposes L-compatible layout and final prompt fields in the asset editor", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-lab-visual-assets-panel.tsx"), "utf8");
        expect(source).not.toContain("<span>生成版式</span>");
        expect(source).toContain("最终生图提示词");
        expect(source).toContain("normalizeDramaAssetGenerationLayout");
    });

    it("retains extracted visual fields in the persisted UI asset", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("...readDramaLabAssetVisualDetails(asset)");
        expect(source).toContain("buildDramaLabAssetImagePrompt(project, asset, kind)");
        expect(source).toContain("...readDramaLabAssetVisualDetails(libraryAsset.metadata)");
    });

    it("offers a canvas entry for each asset without removing existing actions", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("onOpenCanvasHref");
        expect(source).toContain("在画布查看");
        expect(source).toContain("PanelsTopLeft");
        expect(source).toContain("AI 生图");
        expect(source).toContain("加入素材库");
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
    it("matches L editor structure and keeps only the final prompt/anchor fields visible", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain('width="min(960px, calc(100vw - 32px))"');
        expect(source).toContain('maxHeight: "calc(100vh - 160px)"');
        expect(source).toContain('overflowY: "auto"');
        expect(source).toContain("点击或拖入参考图");
        expect(source).not.toContain("<span>原始图片提示词</span>");
        expect(source).not.toContain("<span>生成版式</span>");
        expect(source).not.toContain("profileLabel(key)");
    });

    it("uses contain previews and accepts imageUrl-only legacy assets", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("!object-contain");
        const references = await readFile(resolve(process.cwd(), "src/lib/drama-asset-references.ts"), "utf8");
        expect(references).toContain("asset.imageUrl?.trim()");
    });

    it("supports multi-file reference upload and immediate L-style actions after upload", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("multiple");
        expect(source).toContain("Promise.all");
        expect(source).toContain("setEditor");
        expect(source).toContain("从参考图提取描述");
        expect(source).toContain("移除参考图");
    });

    it("renders reference extraction, prompt regeneration, anchor extraction, and stage generation actions", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain("从参考图提取描述");
        expect(source).toContain("重新生成提示词");
        expect(source).toContain("提炼视觉锚点");
        expect(source).toContain("AI 生成造型");
        expect(source).toContain("移除参考图");
    });
});

describe("L-style prop editor modal", () => {
    it("keeps the prop editor compact and limited to L-style fields", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        expect(source).toContain('title={asset.id ? "编辑道具" : "新增道具"}');
        expect(source).toContain("提取特征描述");
        expect(source).toContain("<span>名称</span>");
        expect(source).toContain("<span>类型</span>");
        expect(source).toContain("<span>描述</span>");
        expect(source).toContain("<span>图生提示词</span>");
        const propBranch = source.slice(source.indexOf('if (editor.kind === \\"props\\")'), source.indexOf("return (", source.indexOf('if (editor.kind === \\"props\\")')));
        expect(propBranch).not.toContain("生成版式");
    });
});

describe("L-style prop reference placement", () => {
    it("uses one uploadable reference frame and keeps actions to its right", async () => {
        const source = await readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");
        const propStart = source.indexOf('if (editor.kind === "props")');
        const propEnd = source.indexOf("return (", source.indexOf("    }", propStart) + 5);
        const propBranch = source.slice(propStart, propEnd);

        expect(propBranch).toContain('data-prop-reference-frame="true"');
        expect(propBranch).toContain('className="flex flex-col items-start gap-1.5"');
        expect(propBranch).not.toContain("+ 上传");
        expect(propBranch).not.toContain("references.map");
    });
});
