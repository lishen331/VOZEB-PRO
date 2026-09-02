import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama script workbench", () => {
    it("keeps story generation and script editing separate while importing only text content", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx"), "utf8");

        expect(source).not.toContain(">剧集信息<");
        expect(source).toContain('name="storyOutline"');
        expect(source).toContain(">故事生成</h2>");
        expect(source).toContain('label: "选择剧本"');
        expect(source).toContain('title="从剧本库导入"');
        expect(source).toContain("const sourceEpisodes = normalizeEpisodes(source.episodes)");
        expect(source).toContain('const sourceSummary = typeof source.summary === "string" ? source.summary : "";');
        expect(source).toContain("description: sourceSummary,");
        expect(source).toContain("...(importedEpisodes.length ? { episodes: importedEpisodes } : {}),");
        expect(source).toContain("onActiveEpisodeChange(importedEpisodes[0].id)");
        expect(source).toContain("不会导入角色、场景、分镜、图片或视频");
    });
    it("keeps legacy subtitle text available to the dialogue audio card", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx"), "utf8");
        expect(source).toContain('subtitle: typeof shot.subtitle === "string" ? shot.subtitle : undefined');
        expect(source).toContain('kind === "narration" ? shot.narration || "" : shot.dialogue || shot.subtitle || ""');
    });

    it("keeps a partially migrated legacy root audio state on only its proven track", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx"), "utf8");
        expect(source).toContain('const opposite = kind === "narration" ? shot.dialogueAudio : shot.narrationAudio;');
        expect(source).toContain('opposite?.taskId?.trim() === legacyTaskId');
        expect(source).toContain('strictLegacyAudioKind(shot) !== kind');
        expect(source).not.toContain("never mirror the old root state into the missing card");
    });
});
