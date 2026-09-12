import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const path = "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx";
const optionsPath = "src/lib/drama-lab-story-options.ts";

describe("drama lab story generation options", () => {
    it("matches LocalMiniDrama story style and script type options", async () => {
        const source = await readFile(path, "utf8");
        const options = await readFile(optionsPath, "utf8");
        expect(source).toContain("DRAMA_LAB_STORY_STYLE_PRESETS.map");
        expect(source).toContain("DRAMA_LAB_SCRIPT_TYPE_PRESETS.map");
        for (const value of ["modern", "ancient", "fantasy", "daily", "drama", "comedy", "adventure"]) expect(options).toContain(`value: "${value}"`);
        for (const label of ["现代", "古风", "奇幻", "日常", "剧情", "喜剧", "冒险"]) expect(options).toContain(`label: "${label}"`);
    });

    it("leaves both options unselected by default, uses placeholders, and offers simple custom inputs", async () => {
        const source = await readFile(path, "utf8");
        expect(source).toContain('useState("")');
        expect(source).toContain('placeholder="剧本风格"');
        expect(source).toContain('placeholder="剧本类型"');
        expect(source).toContain("DRAMA_LAB_CUSTOM_OPTION_VALUE");
        expect(source).toContain("添加自定义剧本风格");
        expect(source).toContain("添加自定义剧本类型");
        expect(source).toContain("...(storyStyle ? { storyStyle } : {})");
        expect(source).toContain("...(scriptType ? { scriptType } : {})");
    });

    it("uses an editable numeric stepper and saves current options before starting generation", async () => {
        const source = await readFile(path, "utf8");
        expect(source).toContain("InputNumber");
        expect(source).toContain('addonBefore="集数"');
        expect(source).toContain("min={1}");
        expect(source).toContain("max={100}");
        expect(source).toContain("precision={0}");
        expect(source).toContain("await saveNow({ silent: true })");
        expect(source).toContain("storyStyle: proj.storyStyle");
        expect(source).toContain("scriptType: proj.scriptType");
    });
    it("persists selected project options during autosave and exposes custom option deletion", async () => {
        const source = await readFile(path, "utf8");
        expect(source).toContain("storyStyle: nextProject.storyStyle");
        expect(source).toContain("scriptType: nextProject.scriptType");
        expect(source).toContain('method: "DELETE"');
        expect(source).toContain("删除自定义选项");
        expect(source).toContain('setStoryStyle("")');
        expect(source).toContain('setScriptType("")');
    });
});
