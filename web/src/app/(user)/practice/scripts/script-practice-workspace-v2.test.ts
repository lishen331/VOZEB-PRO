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
        expect(source).toContain("await practiceScriptsApi.stopRun(selectedId, runId)");
        const stopHandler = source.slice(source.indexOf("await practiceScriptsApi.stopRun(selectedId, runId)"));
        expect(stopHandler.indexOf("await practiceScriptsApi.stopRun(selectedId, runId)")).toBeLessThan(stopHandler.indexOf("abortRef.current?.abort()"));
        expect(source).toContain('event.type === "run_completed"');
    });

    it("keeps only the latest failed Run available for refresh-time retry", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/api/practice/scripts/[id]/tree/route.ts"), "utf8");
        expect(source).toContain("const latestRun = runs[0]");
        expect(source).toContain('"partial_failed", "failed"');
        expect(source).toContain("data: { items, activeRuns }");
    });

    it("clears stale project state, avoids speculative artifact requests, and guards confirmations", async () => {
        const source = await readFile(resolve(process.cwd(), "src/app/(user)/practice/scripts/script-practice-workspace.tsx"), "utf8");
        expect(source).toContain("const selectProject =");
        expect(source).toContain('setSelectedKey("")');
        expect(source).toContain("setArtifact(null)");
        expect(source).toContain("tree.some((item) => item.key === selectedKey)");
        expect(source).toContain('startsWith("pending:")');
        expect(source).toContain("void runAction(confirmCurrentArtifact");
        expect(source).toContain("confirming");
        expect(source).toContain("action.reason");
        expect(source).toContain("runError");
        expect(source).toContain("setBusy(true)");
        expect(source).toContain("activeRun?.errorMessage");
        expect(source).toContain("selectedIdRef.current !== id");
        expect(source.indexOf("practiceScriptsApi.createRun(project.id")).toBeLessThan(source.indexOf("selectProject(project.id)"));
        expect(source).toContain("let active = true");
        expect(source).toContain("active = false");
        expect(source).toContain("selectedIdRef.current !== projectId");
        expect(source).toContain("if (active) setArtifact");
        expect(source).toContain("resolveScriptWorkflowActions");
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
        const workflowSource = await readFile(resolve(process.cwd(), "src/app/(user)/practice/scripts/script-workflow-state.ts"), "utf8");
        expect(workflowSource).toContain("导演规划");
        expect(source).toContain("activeRuns");
        expect(source).toContain("consumeEvents");
        expect(source).toContain("seenEventKeys");
        expect(source).toContain("publicPreviewText");
        expect(source).toContain("publicArtifactText");
        expect(source).toContain('not_started: { text: "未开始"');
        expect(source).toContain("sequence");
        expect(source).toContain("previewRawRef");
        expect(source).toContain("AGENT_LABELS");
        expect(source).toContain('event.data.agentKey || "orchestrator"');
        const treeSource = await readFile(resolve(process.cwd(), "src/app/api/practice/scripts/[id]/tree/route.ts"), "utf8");
        expect(treeSource).toContain("compareScriptArtifactTypes");
        expect(treeSource).toContain("WORKFLOW_ORDER");
        expect(workflowSource).toContain("not_started");
        expect(source).toContain("waiting_first_token");
        expect(treeSource).toContain("WORKFLOW_ORDER");
    });
});
