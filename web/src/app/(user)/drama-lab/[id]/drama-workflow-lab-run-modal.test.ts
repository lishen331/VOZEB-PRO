import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workbenchPath = resolve(process.cwd(), "src/app/(user)/drama-lab/[id]/drama-workflow-lab-project-complete.tsx");

describe("drama lab workflow run modal", () => {
    it("starts and polls the durable server workflow instead of simulating timers", async () => {
        const source = await readFile(workbenchPath, "utf8");

        expect(source).toContain("/api/drama-lab/projects/${encodeURIComponent(projectId)}/workflow");
        expect(source).toContain('method: "POST"');
        expect(source).toContain("fetchWorkflow(workflowTask.id)");
        expect(source).toContain("setTimeout(poll, 1_200)");
        expect(source).not.toContain("simulateRun");
        expect(source).not.toContain("simulationTimersRef");
    });

    it("exposes cancel and resume actions and renders server task failures", async () => {
        const source = await readFile(workbenchPath, "utf8");

        expect(source).toContain('method: "PATCH"');
        expect(source).toContain('changeRun("cancel")');
        expect(source).toContain('changeRun("resume")');
        expect(source).toContain("workflowError");
        expect(source).toContain("workflowTask?.steps");
        expect(source).toContain("workflowTask.progress");
    });
});
