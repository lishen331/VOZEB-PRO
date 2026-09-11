import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const path = "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx";

describe("drama lab workbench panel toggles", () => {
    it("starts the episode sidebar collapsed", async () => {
        const source = await readFile(path, "utf8");

        expect(source).toContain("const [sidebarCollapsed, setSidebarCollapsed] = useState(true);");
    });

    it("provides one desktop collaboration toggle in the top toolbar", async () => {
        const source = await readFile(path, "utf8");
        const header = source.slice(source.indexOf("<header className="), source.indexOf("{/* 步骤导航 */}"));
        const collaborationAside = source.slice(source.indexOf('className={cn("hidden min-h-0 shrink-0 flex-col border-l'));

        expect(header).toContain('className="hidden lg:inline-flex"');
        expect(header).toContain("onClick={() => setCollaborationCollapsed((current) => !current)}");
        expect(collaborationAside).not.toContain("onClick={() => setCollaborationCollapsed((current) => !current)}");
    });
});
