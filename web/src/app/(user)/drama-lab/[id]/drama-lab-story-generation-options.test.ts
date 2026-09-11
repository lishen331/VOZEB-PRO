import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const path = "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx";

describe("drama lab story generation options", () => {
    it("matches LocalMiniDrama story style and script type options", async () => {
        const source = await readFile(path, "utf8");
        for (const value of ["modern", "ancient", "fantasy", "daily", "drama", "comedy", "adventure"]) expect(source).toContain(`value="${value}"`);
        for (const label of ["现代", "古风", "奇幻", "日常", "剧情", "喜剧", "冒险"]) expect(source).toContain(`>${label}</Option>`);
        for (const value of ["现代写实", "悬疑", "浪漫", "动作", "短剧", "电影"]) expect(source).not.toContain(`value="${value}"`);
    });

    it("leaves both options unselected by default and uses placeholders", async () => {
        const source = await readFile(path, "utf8");
        expect(source).toContain('useState("")');
        expect(source).toContain('placeholder="剧本风格"');
        expect(source).toContain('placeholder="剧本类型"');
        expect(source).toContain("...(storyStyle ? { storyStyle } : {})");
        expect(source).toContain("...(scriptType ? { scriptType } : {})");
    });
});
