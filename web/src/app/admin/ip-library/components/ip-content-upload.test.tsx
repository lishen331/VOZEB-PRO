import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("IP content upload", () => {
    it("deletes unreferenced original files instead of only clearing their form selection", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/admin/ip-library/components/ip-content-upload.tsx"), "utf8");

        expect(source).toContain("adminIpLibraryApi.deleteFile(ipId, selected.id)");
        expect(source).toContain("onDeleted?.(selected.id)");
        expect(source).toContain('aria-label="删除未引用原文件"');
        expect(source).toContain('aria-label="取消选择当前文件"');
    });
});
