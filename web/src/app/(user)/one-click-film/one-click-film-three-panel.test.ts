import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
describe("L storyboard three-panel layout", () => {
    it("renders script, reference and video regions with contain-fit previews", async () => {
        const source = await readFile("src/app/(user)/one-click-film/[id]/one-click-film-shot-cards.tsx", "utf8");
        expect(source).toContain('aria-label="分镜脚本"');
        expect(source).toContain('aria-label="分镜参考图"');
        expect(source).toContain('aria-label="分镜视频"');
        expect(source).toContain("lg:grid-cols-3");
        expect(source).toContain("shot.frames?.first?.url");
        expect(source).toContain("shot.frames?.last?.url");
        expect(source).toContain("object-contain");
        expect(source).toContain("src={shot.videoUrl}");
    });
});
