import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("practice script workspace contract", () => {
    it("contains the confirmed prose-to-screenplay-to-storyboard workflow", async () => {
        const page = await readFile(resolve(process.cwd(), "src/app/(user)/practice/scripts/script-practice-workspace.tsx"), "utf8");
        expect(page).toContain("输入一句话创意");
        expect(page).toContain("导入小说");
        expect(page).toContain("完整短故事");
        expect(page).toContain("小说总纲与章纲");
        expect(page).toContain("改编策划");
        expect(page).toContain("分集剧本");
        expect(page).toContain("审核剧本");
        expect(page).toContain("文字分镜");
        expect(page).toContain("资产提示词");
        expect(page).toContain("SSE");
        expect(page).not.toContain("协作者");
        expect(page).not.toContain("实时光标");
        expect(page).not.toContain("生成图片");
        expect(page).not.toContain("生成视频");
    });
});
