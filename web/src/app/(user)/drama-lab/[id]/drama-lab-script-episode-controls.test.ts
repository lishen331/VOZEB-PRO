import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("drama lab script episode controls", () => {
    it("renders a shared episode selector and add control above the script", async () => {
        const source = await readFile(new URL("./drama-workflow-lab-project-complete.tsx", import.meta.url), "utf8");
        expect(source).toContain('aria-label="选择当前剧集"');
        expect(source).toContain("switchScriptEpisode");
        expect(source).toContain('aria-label="添加一集"');
        expect(source.indexOf('aria-label="选择当前剧集"')).toBeLessThan(source.indexOf('<Form.Item name="script">'));
    });

    it("shows a hover delete action in the left episode directory", async () => {
        const source = await readFile(new URL("./drama-workflow-lab-project-complete.tsx", import.meta.url), "utf8");
        expect(source).toContain("aria-label={`删除剧集 ${ep.title}`}");
        expect(source).toContain("group-hover:opacity-100");
        expect(source).toContain("confirmDeleteEpisode");
        expect(source).toContain("至少保留一集");
    });
});
