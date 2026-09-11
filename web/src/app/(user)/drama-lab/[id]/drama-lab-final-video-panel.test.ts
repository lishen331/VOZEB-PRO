import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("drama lab final video preview", () => {
    it("renders a fixed contain preview and keeps description/actions aligned below it", async () => {
        const source = await readFile(new URL("./drama-lab-final-video-panel.tsx", import.meta.url), "utf8");

        expect(source).toContain('title="合成成片视频"');
        expect(source).toContain("将当前剧集全部分镜合成为 MP4 成片，不是项目归档 ZIP 或剪映草稿。");
        expect(source).toContain("result?.url");
        expect(source).toContain("aspect-video w-full");
        expect(source).toContain("object-contain");
        expect(source).toContain("controls");
        expect(source).toContain("justify-between");
        expect(source).not.toContain("下载成片 MP4");
        expect(source).not.toContain("点击放大");
    });
});
