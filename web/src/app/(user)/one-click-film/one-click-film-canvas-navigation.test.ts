import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const canvasEntryPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/canvas/page.tsx");
const contextBarPath = resolve(process.cwd(), "src/app/(user)/drama-canvas/[id]/drama-canvas-context-bar.tsx");
const canvasRuntimePath = resolve(process.cwd(), "src/features/drama-canvas-runtime/[id]/canvas-client-page.tsx");

/**
 * 画布被创作工坊（教学版）和一键成片（商单版）共用，回跳必须按 source 分流。
 * 这些断言防止有人把一键成片的返回路径again写死成 /drama-lab。
 */
describe("one-click-film canvas navigation", () => {
    it("forwards episode, shot and source when opening the商单 canvas", async () => {
        const source = await readFile(canvasEntryPath, "utf8");

        expect(source).toContain("shotId");
        expect(source).toContain('source: "one-click-film"');
        expect(source).toContain("dramaProjectId");
        expect(source).toContain("episode-canvas");
        expect(source).toMatch(/router\.replace\(/);
    });

    it("returns to the one-click-film workbench instead of the teaching workshop", async () => {
        const source = await readFile(contextBarPath, "utf8");

        expect(source).toContain('searchParams.get("source") === "one-click-film"');
        expect(source).toContain("/api/one-click-film/projects");
        expect(source).toContain("/one-click-film/");
        // 两套 episode-canvas 响应形状不同，必须同时兼容。
        expect(source).toContain("payload.data?.canvasId");
        expect(source).toContain("一键成片");
    });

    it("keeps the canvas workbench button source-aware", async () => {
        const source = await readFile(canvasRuntimePath, "utf8");

        expect(source).toContain('searchParams.get("source") === "one-click-film"');
        expect(source).toContain('router.push(isOneClickFilm ? "/one-click-film" : "/drama-lab")');
        expect(source).toContain("/one-click-film/${encodeURIComponent(dramaProjectId)}");
    });
});
