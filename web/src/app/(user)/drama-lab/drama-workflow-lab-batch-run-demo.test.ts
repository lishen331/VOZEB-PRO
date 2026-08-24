import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama workflow lab batch run demo", () => {
    it("replaces project settings with a local-only full workflow plan", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx"), "utf8");
        const workflowModal = source.slice(source.indexOf("function WorkflowRunModal"), source.indexOf("// 5. 内容审核面板"));

        expect(source).toContain("一键全流程");
        expect(source).not.toContain(">项目设置<");
        expect(source).toContain("生成到资产");
        expect(source).toContain("生成到分镜图");
        expect(source).toContain("生成完整视频");
        expect(workflowModal).toContain("当前集");
        expect(workflowModal).toContain("全部剧集");
        expect(workflowModal).toContain("单镜头时长");
        expect(workflowModal).toContain("输出语言");
        expect(workflowModal).toContain("视觉风格");
        expect(workflowModal).toContain("自动导出");
        expect(workflowModal).toContain("使用后台默认渠道");
        expect(workflowModal).toContain("开始模拟执行");
        expect(workflowModal).not.toContain("fetch(");
        expect(workflowModal).not.toContain("onSave(");
    });
});
