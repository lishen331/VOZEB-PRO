import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("outline resource image editor layout", () => {
    it("keeps one reference upload entry and places AI generation at the right edge", async () => {
        const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
        expect(source.match(/>上传图片</g) || []).toHaveLength(0);
        expect(source).toContain('className="mt-2 flex justify-end"');
        expect(source).toContain("AI 生成");
    });

    it("allows replacing the primary image by hover upload or file drop", async () => {
        const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");
        expect(source).toContain("替换主图");
        expect(source).toContain("uploadResourcePrimaryImage");
        expect(source).toContain("event.dataTransfer.files?.[0]");
        expect(source).toContain('title: "当前主图"');
    });
});
