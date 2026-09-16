import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workbenchPath = resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx");
const taskPanelPath = resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-lab-task-panel.tsx");

describe("drama lab sidebar split layout", () => {
    it("allocates the expanded sidebar between episodes and tasks", async () => {
        const source = await readFile(workbenchPath, "utf8");

        expect(source).toContain('sidebarCollapsed ? "flex-1 px-1" : "flex-1 basis-0"');
        expect(source).toContain('className={!sidebarCollapsed ? "min-h-0 flex-1 basis-0 overflow-hidden" : undefined}');
        expect(source).toContain("overflow-y-auto p-2");
    });

    it("makes the expanded task panel a bounded scrolling region", async () => {
        const source = await readFile(taskPanelPath, "utf8");

        expect(source).toContain('!compact && "flex min-h-0 flex-col"');
        expect(source).toContain('!compact && "min-h-0 flex-1 overflow-y-auto"');
        expect(source).toContain('className="space-y-1.5"');
        expect(source).not.toContain('compact ? "max-h-56 space-y-1.5 overflow-y-auto overscroll-contain pr-1"');
    });
});
