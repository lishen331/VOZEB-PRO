import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const panelPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-asset-panel.tsx");
const cardsPath = resolve(process.cwd(), "src/app/(user)/one-click-film/[id]/one-click-film-shot-cards.tsx");

/**
 * L 资产卡底部的 `asset-storyboard-link`：影响的分镜 `#N` + 重新生成分镜图。
 *
 * 派生语义的行为测试在 `src/lib/one-click/affected-shots.test.ts`；
 * 这里锁「真的挂进卡片」「跳转目标存在」「复用一键成片生图路由」。
 */
describe("one-click-film affected shots row", () => {
    it("is mounted on every asset card", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).toContain("<AffectedShotsRow");
        expect(source).toContain("void regenerateAffectedShots(asset)");
    });

    it("derives the list from the tested module", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).toContain('from "@/lib/one-click/affected-shots"');
        expect(source).toContain("findAffectedShots(project, kind, asset.id)");
    });

    it("hides itself when nothing references the asset", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).toContain("if (!affected.length) return null;");
    });

    it("jumps to a real shot DOM id", async () => {
        const panel = await readFile(panelPath, "utf8");
        expect(panel).toContain("one-click-shot-${item.shot.id}");
        // 终点证据：分镜卡必须真的带这个 id，否则跳转是死的
        const cards = await readFile(cardsPath, "utf8");
        expect(cards).toContain("id={`one-click-shot-${shot.id}`}");
    });

    it("regenerates through the one-click image route, not drama-lab", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).toContain("/generate-image?episodeId=");
        expect(source).not.toContain("/api/drama-lab");
    });

    it("reports progress and keeps going after a single failure", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).toContain("setRegenProgress({ current: position + 1, total: affected.length })");
        // 单个失败不应中断整批
        expect(source).toContain("failed += 1;");
    });

    it("refreshes from the server instead of guessing new state", async () => {
        const source = await readFile(panelPath, "utf8");
        expect(source).toContain("onProjectChange(refreshed.project as DramaProject)");
    });
});
