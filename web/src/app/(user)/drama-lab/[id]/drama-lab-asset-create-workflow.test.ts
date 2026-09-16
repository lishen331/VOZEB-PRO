import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const readSource = () => readFile(new URL("./drama-lab-visual-assets-panel.tsx", import.meta.url), "utf8");

function assetEditorSource(source: string) {
    const start = source.indexOf("function AssetEditorModal(");
    const end = source.indexOf("function cloneAsset(", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    return source.slice(start, end);
}

describe("drama lab new asset single-page workflow", () => {
    it("keeps creation in one modal without a second step or next button", async () => {
        const editor = assetEditorSource(await readSource());
        expect(editor).not.toContain("createStep");
        expect(editor).not.toContain("setCreateStep");
        expect(editor).not.toContain("下一步");
        expect(editor).not.toContain("● 1 主图");
        expect(editor).not.toContain("○ 2 参考与提示词");
        expect(editor).toContain("data-asset-create-single-page");
        expect(editor).toContain("onSave");
    });

    it("connects the primary image surface to a real file input and drag upload", async () => {
        const editor = assetEditorSource(await readSource());
        expect(editor).toContain("data-asset-primary-dropzone");
        expect(editor).toContain("primaryUploadRef.current?.click()");
        expect(editor).toContain('type="file"');
        expect(editor).toContain('accept="image/*"');
        expect(editor).toContain("onReplacePrimary");
        expect(editor).toContain("event.dataTransfer.files");
    });

    it("uploads prompt references in the same input surface and preserves mention support", async () => {
        const editor = assetEditorSource(await readSource());
        expect(editor).toContain("data-asset-prompt-dropzone");
        expect(editor).toContain("data-asset-reference-upload");
        expect(editor).toContain("onUploadFile");
        expect(editor).toContain("promptReferences");
        expect(editor).toContain("@图");
        expect(editor).toContain("onAddPrimaryToReferences");
        expect(editor).toContain("onRemoveReferenceById");
        expect(editor).toContain("onPreview");
    });

    it("renders every configured image model instead of a hard-coded demo option", async () => {
        const source = await readSource();
        const editor = assetEditorSource(source);
        expect(source).toContain('selectableModelsByCapability(config, "image")');
        expect(editor).toContain("availableModels.length ? availableModels : [defaultModel]");
        expect(editor).toContain("selectedModel");
    });

    it("submits the original prompt, references, selected model and image parameters", async () => {
        const source = await readSource();
        const editor = assetEditorSource(source);
        expect(editor).toContain("data-asset-generate-image");
        expect(editor).toContain('prompt: asset.polishedPrompt || ""');
        expect(editor).toContain("model: selectedModel");
        expect(editor).toContain("size: resolveAssetImageSize(selectedAspect, selectedResolution)");
        expect(editor).toContain("quality: selectedQuality");
        expect(source).toContain("const prompt = overrides?.prompt ??");
        expect(source).toContain("const sourceReferences =");
        expect(source).toContain("createImageGenerationTask(imageConfig, prompt, imageReferences");
    });

    it("keeps the modal open while generation runs and writes the generated primary in place", async () => {
        const source = await readSource();
        const editor = assetEditorSource(source);
        expect(editor).toContain("loading={busy}");
        expect(editor).not.toMatch(/onGenerate\([^)]*\)[\s\S]{0,160}onClose/);
        expect(source).toContain("promoteGeneratedReference(effectiveAsset, references)");
        expect(source).toContain("图片已生成并设为主图");
    });
});
