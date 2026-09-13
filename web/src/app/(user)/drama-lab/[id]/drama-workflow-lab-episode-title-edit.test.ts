import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("drama lab script episode title editing", () => {
    it("supports double-click rename in the episode sidebar and Enter/Escape handling", async () => {
        const source = await readFile(new URL("./drama-workflow-lab-project-complete.tsx", import.meta.url), "utf8");

        expect(source).toContain("onDoubleClick={() => startEpisodeRename(ep)}");
        expect(source).toContain("aria-label={`重命名${ep.title}`}");
        expect(source).toContain("handleEpisodeRenameKeyDown(event, ep)");
        expect(source).toContain('event.key === "Enter"');
        expect(source).toContain('event.key === "Escape"');
    });

    it("keeps the current episode title editable while the select opens only from its trigger", async () => {
        const source = await readFile(new URL("./drama-workflow-lab-project-complete.tsx", import.meta.url), "utf8");

        expect(source).toContain('aria-label="当前剧集标题"');
        expect(source).toContain("saveScriptEpisodeTitle");
        expect(source).toContain('aria-label="选择剧集"');
        expect(source).toContain('suffixIcon={<ChevronDown className="size-4" />}');
    });
});
