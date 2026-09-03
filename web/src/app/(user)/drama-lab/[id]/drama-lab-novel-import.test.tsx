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
        expect(markup).toContain('accept=".txt,.md,text/plain,text/markdown"');
        expect(markup).toContain("导入小说");
        expect(markup).toContain("或拖拽 TXT/MD 文件到这里");
    });

    it("keeps the shared preview request and byte decoder on the component path", async () => {
        const source = await import("node:fs/promises").then(({ readFile }) => readFile(new URL("./drama-lab-novel-import.tsx", import.meta.url), "utf8"));

        expect(source).toContain("decodeDramaNovelBytes(await file.arrayBuffer())");
        expect(source).toContain("readingRef.current || importingRef.current");
        expect(source).toContain("onDrop={handleDrop}");
        expect(source).toContain("requestNovelImport(projectId, { sourceText: content, fileName: file.name, commit: false })");
    });
});
