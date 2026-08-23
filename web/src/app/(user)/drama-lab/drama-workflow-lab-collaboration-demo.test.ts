import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("drama workflow lab collaboration demo", () => {
    it("keeps team approval as a local-only, responsive workflow demo", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx"), "utf8");
        const panel = source.slice(source.indexOf("function CollaborationPanel"), source.indexOf("function ToggleRow"));

        expect(source).toContain('placement="right"');
        expect(source).toContain("团队协作与审批");
        expect(source).toContain("lg:flex");
        expect(source).toContain("StageCollaborationBanner");
        expect(source).toContain("exportBlockedByApproval");
        expect(source).toContain("strictApprovalBlock");
        expect(source).toContain("需确认版本");

        expect(panel).toContain("严格");
        expect(panel).toContain("并行");
        expect(panel).toContain("审批配置");
        expect(panel).toContain("反馈与提醒");
        expect(panel).toContain("不创建项目组、不发送通知、不上传附件");
        expect(panel).not.toContain("fetch(");
    });
});
