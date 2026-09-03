import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const contextBarPath = resolve(process.cwd(), "src/app/(user)/drama-canvas/[id]/drama-canvas-context-bar.tsx");
const createPagePath = resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/create/page.tsx");
const workbenchPath = resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx");
const runtimePath = resolve(process.cwd(), "src/features/drama-canvas-runtime/[id]/canvas-client-page.tsx");

describe("drama canvas return navigation", () => {
    it("returns to the selected episode storyboard and shot", async () => {
        const source = await readFile(contextBarPath, "utf8");

        expect(source).toContain("/create?episode=${encodeURIComponent(episodeId)}&stage=storyboard");
        expect(source).toContain("#storyboard-shot-${encodeURIComponent(shotId)}");
        expect(source).toContain("type DramaEpisodeSummary = { id: string; title?: string; episodeNumber?: number }");
        expect(source).toContain("(left.episodeNumber ?? 0) - (right.episodeNumber ?? 0)");
        expect(source).not.toContain("left.number");
        expect(source).not.toContain("episode.order");
    });

    it("forwards the storyboard stage and resolves the shot hash", async () => {
        const [page, workbench] = await Promise.all([readFile(createPagePath, "utf8"), readFile(workbenchPath, "utf8")]);

        expect(page).toContain('initialStep={stage === "storyboard" ? "storyboard" : undefined}');
        expect(workbench).toContain("initialStep?: StepKey");
        expect(workbench).toContain('useState<StepKey>(initialStep || "script")');
        expect(workbench).toContain("window.location.hash.match(/^#storyboard-shot-(.+)$/)");
        expect(workbench).toContain("document.getElementById(`storyboard-shot-${pendingStoryboardShotId.current}`)?.scrollIntoView");
    });

    it("keeps the copied Canvas workbench action inside Drama Lab", async () => {
        const source = await readFile(runtimePath, "utf8");

        expect(source).toContain('const query = new URLSearchParams({ episode: episodeId, stage: "storyboard" })');
        expect(source).toContain("#storyboard-shot-${encodeURIComponent(shotId)}");
        expect(source).not.toContain('onWorkbench={() => router.push("/create")}');
    });
});
