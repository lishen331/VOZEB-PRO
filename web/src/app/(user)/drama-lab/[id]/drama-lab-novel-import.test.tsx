import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { DramaLabNovelImport } from "./drama-lab-novel-import";

const messageApi = {
    error: vi.fn(),
    success: vi.fn(),
} as never;

describe("DramaLabNovelImport", () => {
    it("renders a labelled drop zone and keeps the file-picker fallback", () => {
        const markup = renderToStaticMarkup(<DramaLabNovelImport projectId="project-one" currentEpisodeCount={1} messageApi={messageApi} onImported={vi.fn()} />);

        expect(markup).toContain('data-drama-lab-novel-dropzone="true"');
        expect(markup).toContain('aria-label="小说文件导入区域"');
        expect(markup).toContain('accept=".txt,.md,.markdown,.docx,.doc,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"');
        expect(markup).toContain("导入小说");
        expect(markup).toContain("或拖拽 TXT/MD/DOCX/DOC 文件到这里");
    });

    it("can host the script editor inside the drop zone", () => {
        const markup = renderToStaticMarkup(
            <DramaLabNovelImport projectId="project-one" currentEpisodeCount={1} messageApi={messageApi} onImported={vi.fn()}>
                <textarea aria-label="script-editor" />
            </DramaLabNovelImport>,
        );

        const dropZoneIndex = markup.indexOf('data-drama-lab-novel-dropzone="true"');
        expect(dropZoneIndex).toBeGreaterThanOrEqual(0);
        expect(dropZoneIndex).toBeLessThan(markup.indexOf('aria-label="script-editor"'));
        expect(markup).toContain('class="flex w-full flex-col gap-2 rounded-lg border border-dashed p-3');
    });

    it("keeps the shared preview request and byte decoder on the component path", async () => {
        const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("./drama-lab-novel-import.tsx", import.meta.url), "utf8"));

        expect(source).toContain("new FormData()");
        expect(source).toContain('form.append("file", file)');
        expect(source).toContain("readingRef.current || importingRef.current");
        expect(source).toContain("onDrop={handleDrop}");
        expect(source).toContain("requestNovelImportFile(projectId, file, false)");
    });

    it("can mount its existing picker in the story action bar without removing the drop zone", async () => {
        const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("./drama-lab-novel-import.tsx", import.meta.url), "utf8"));

        expect(source).toContain("triggerContainerId?: string");
        expect(source).toContain("createPortal(importTrigger, triggerContainer)");
        expect(source).toContain("!triggerContainerId ? importTrigger : null");
    });
});
