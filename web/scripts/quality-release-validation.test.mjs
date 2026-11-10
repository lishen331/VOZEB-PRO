import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

describe("pre-release quality validation", () => {
    it("runs every full release gate on an explicit manual workflow without publishing a tag", async () => {
        const workflow = parse(await readFile(new URL("../../.github/workflows/quality.yml", import.meta.url), "utf8"));
        for (const name of ["Unit tests", "Install Playwright Chromium", "Browser E2E", "PostgreSQL integration tests"]) {
            const step = workflow.jobs.web.steps.find((candidate) => candidate.name === name);
            expect(step, name).toBeDefined();
            expect(step.if, name).toContain("startsWith(github.ref, 'refs/tags/')");
            expect(step.if, name).toContain("github.event_name == 'workflow_dispatch'");
            expect(step["continue-on-error"], name).not.toBe(true);
        }
    });
});
