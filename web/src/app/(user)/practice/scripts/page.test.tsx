import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("practice script workspace contract", () => {
    it("contains the single-user screenplay workflow", async () => {
        const page = await readFile(resolve(process.cwd(), "src/app/(user)/practice/scripts/script-practice-workspace.tsx"), "utf8");
        expect(page).toContain("从一个想法开始");
        expect(page).toContain("从已有剧本导入");
        expect(page).toContain("故事梗概");
        expect(page).toContain("故事大纲");
        expect(page).toContain("场景标题");
        expect(page).toContain("对白");
        expect(page).toContain("生成建议");
        expect(page).toContain("应用修改");
        expect(page).toContain("版本");
        expect(page).not.toContain("协作者");
        expect(page).not.toContain("实时光标");
    });
});
