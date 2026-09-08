import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama lab visual assets", () => {
    it("routes affected-shot regeneration through the server-owned storyboard generation endpoint", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-lab-visual-assets-panel.tsx"), "utf8");

        expect(source).toContain("/generate-image?episodeId=${encodeURIComponent(shot.episodeId)}");
        expect(source).not.toContain("dramaLabShotPrompt(project, shot)");
    });

    it("serializes project writes and applies generated references to the latest asset state", async () => {
        const projectSource = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx"), "utf8");
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-lab-visual-assets-panel.tsx"), "utf8");

        expect(projectSource).toContain("const saveQueueRef = useRef<Promise<boolean>>(Promise.resolve(true));");
        expect(projectSource).toContain('typeof updatesOrUpdater === "function" ? updatesOrUpdater(current) : updatesOrUpdater');
        expect(source).toContain("return replaceAssets((current) => current.map((asset) => (asset.id === assetId ? { ...asset, ...patch } : asset)))");
    });
});

describe("extraction detail wiring", () => {
    it("retains extracted visual fields in the persisted UI asset", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-lab-visual-assets-panel.tsx"), "utf8");
        expect(source).toContain("...readDramaLabAssetVisualDetails(asset)");
        expect(source).toContain("buildDramaLabAssetImagePrompt(project, asset, kind)");
        expect(source).toContain("...readDramaLabAssetVisualDetails(libraryAsset.metadata)");
    });
});
