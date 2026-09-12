import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const path = new URL("./drama-workflow-lab-project-complete.tsx", import.meta.url);

describe("drama lab workbench panel toggles", () => {
    it("starts the episode and collaboration sidebars collapsed", async () => {
        const source = await readFile(path, "utf8");

        expect(source).toContain("const [sidebarCollapsed, setSidebarCollapsed] = useState(true);");
        expect(source).toContain("const [collaborationCollapsed, setCollaborationCollapsed] = useState(true);");
    });

    it("keeps one desktop collaboration toggle in the side-panel header and the mobile drawer trigger", async () => {
        const source = await readFile(path, "utf8");
        const header = source.slice(source.indexOf("<header className="), source.indexOf("{/* 步骤导航 */}"));
        const collaborationAside = source.slice(source.indexOf('className={cn("hidden min-h-0 shrink-0 flex-col border-l'));

        expect(header).not.toContain("setCollaborationCollapsed((current) => !current)");
        expect(header).toContain('className="lg:!hidden"');
        expect(header).toContain('aria-label="打开团队协作与审批"');
        expect((collaborationAside.match(/setCollaborationCollapsed\(\(current\) => !current\)/g) || []).length).toBe(1);
        expect(collaborationAside).toContain('aria-label={collaborationCollapsed ? "展开团队协作与审批" : "收起团队协作与审批"}');
    });
});
