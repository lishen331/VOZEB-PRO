import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama workflow lab review panel", () => {
    it("uses the persisted server-side AI review contract", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx"), "utf8");
        const reviewPanel = source.slice(source.indexOf("function ReviewPanel"), source.indexOf("// 3. 资产管理面板"));

        expect(reviewPanel).toContain("AI 内容审核");
        expect(reviewPanel).toContain("服务端审核结果");
        expect(reviewPanel).toContain("审核覆盖范围");
        expect(reviewPanel).toContain("审核评分");
        expect(reviewPanel).toContain("待处理问题");
        expect(reviewPanel).toContain("/api/drama/review");
        expect(reviewPanel).toContain("重新审核");
        expect(reviewPanel).toContain("onStepChange(target)");
        expect(reviewPanel).not.toContain("setTimeout");
        expect(reviewPanel).not.toContain("演示报告");

        expect(source).toContain("overflow-x-auto border-b border-border bg-card");
        expect(source).toContain("lg:flex");
        expect(source).toContain('className="min-w-0 flex-1 overflow-y-auto p-4 sm:p-6"');
    });
});
