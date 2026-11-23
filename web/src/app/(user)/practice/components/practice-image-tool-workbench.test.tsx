import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

const sourcePath = new URL("./practice-image-tool-workbench.tsx", import.meta.url);

describe("standalone practice image tools", () => {
    it("keeps the canvas face-expression editor, mask drawing, and local upscale path", async () => {
        const source = await readFile(sourcePath, "utf8");
        expect(source).toContain("CanvasNodeEmotionDialog");
        expect(source).toContain("makeMaskUrl");
        expect(source).toContain("upscaleDataUrl(dataUrl");
        expect(source).toContain('toolId === "super-resolution"');
        expect(source).toContain('toolId === "local-edit"');
    });

    it("uses the practice task proxy for AI tools and only saves after an explicit user action", async () => {
        const source = await readFile(sourcePath, "utf8");
        const saveAction = source.indexOf("const saveResult = async () =>");
        const libraryWrite = source.indexOf("await createLibraryAsset(");
        expect(source).toContain('fetch("/api/practice/image-tools"');
        expect(saveAction).toBeGreaterThan(-1);
        expect(libraryWrite).toBeGreaterThan(saveAction);
        expect(source).toContain("保存到个人素材库");
        expect(source).toContain("setRetryPrompt(finalPrompt)");
    });

    it("preserves an existing result while retrying and displays safe task diagnostics", async () => {
        const source = await readFile(sourcePath, "utf8");
        expect(source).toContain("setError(messageText)");
        expect(source).toContain("setResult(completed)");
        expect(source).toContain("JSON.stringify({ toolId, ...diagnostic");
        expect(source).toContain("run(retryPrompt || undefined)");
    });
});
