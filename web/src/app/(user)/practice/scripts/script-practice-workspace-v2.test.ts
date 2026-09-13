import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("screenwriter workspace v2", () => {
    it("uses work tree, formal artifact canvas, and Agent chat columns", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/practice/scripts/script-practice-workspace.tsx"), "utf8");
        expect(source).toContain('aria-label="剧本工作目录"');
        expect(source).toContain('aria-label="正式创作成果"');
        expect(source).toContain('aria-label="剧本 Agent 对话"');
    });
    it("submits the selected project mode and resumes SSE from the persisted cursor", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/practice/scripts/script-practice-workspace.tsx"), "utf8");
        expect(source).toContain('sourceType: "idea", idea: idea.trim() || undefined, mode');
        expect(source).toContain("consumeEvents(selectedId, runId, activeRun.lastEventSequence)");
        expect(source).toContain("runEventsUrl(projectId, currentRunId, afterSequence)");
        expect(source).not.toContain("await consumeEvents(selectedId, run.id)");
        expect(source).toContain("failedRun.lastEventSequence");
    });

    it("keeps only the latest failed Run available for refresh-time retry", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/api/practice/scripts/[id]/tree/route.ts"), "utf8");
        expect(source).toContain("const latestRun = runs[0]");
        expect(source).toContain('"partial_failed", "failed"');
        expect(source).toContain("data: { items, activeRuns }");
    });

    it("uses stable Run SSE, stop, and failed-only retry", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/practice/scripts/script-practice-workspace.tsx"), "utf8");
        expect(source).toContain("runEventsUrl");
        expect(source).toContain("stopRun");
        expect(source).toContain("retryFailed");
        expect(source).not.toContain("JSON.stringify(stage");
        expect(source).toContain("runAction");
        expect(source).toContain("message.error");
        expect(source).toContain("chatMessages");
        expect(source).toContain("导演规划");
        expect(source).toContain("activeRuns");
        expect(source).toContain("consumeEvents");
    });
});
