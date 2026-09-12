import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const path = "src/app/(user)/drama-lab/[id]/outline/page.tsx";

describe("drama lab batch episode import dialog", () => {
    it("keeps L-style file import controls and supports all requested document formats", async () => {
        const source = await readFile(path, "utf8");

        expect(source).toContain("<AntUpload.Dragger");
        expect(source).toContain('accept=".txt,.md,.markdown,.docx,.doc');
        expect(source).toContain("点击或拖拽上传 TXT / MD / DOCX / DOC 文件");
        expect(source).not.toContain("未选择文件");
    });

    it("aligns both chapter rows with the text area and with each other", async () => {
        const source = await readFile(path, "utf8");

        expect(source).toContain("grid gap-3 px-2");
        expect(source).toContain("grid-cols-[92px_minmax(0,1fr)]");
        expect(source).toContain("justify-self-start text-left text-sm");
        expect(source).toContain("Math.max(1, value - 1)");
        expect(source).toContain("Math.min(100, value + 1)");
        expect(source).toContain("place-items-center border-y border-border");
    });

    it("accepts dropped files in the text area and parses them through the server preview route", async () => {
        const source = await readFile(path, "utf8");

        expect(source).toContain("onDragOver={(event) => event.preventDefault()}");
        expect(source).toContain("event.dataTransfer.files?.[0]");
        expect(source).toContain("/api/drama-lab/projects/${projectId}/import-novel");
        expect(source).toContain('form.append("commit", "false")');
        expect(source).toContain("payload.data?.sourceText");
    });
});
