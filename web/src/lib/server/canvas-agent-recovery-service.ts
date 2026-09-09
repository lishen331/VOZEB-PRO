import { isDramaLabCanvasProject } from "@/lib/drama-lab-canvas-contract";
import { getCanvasProjectForRecovery, mutateCanvasProjectForRecovery } from "./canvas-project-store";
import { listStoredGenerationTaskRecords } from "./generation-task-store";
import { CREATIVE_RUN_EVENT_BATCH_SIZE, listCreativeRunEvents } from "./creative-runtime-store";
import { canvasAgentResultFingerprint, recoverCanvasAgentResults } from "./canvas-agent-result-recovery";
import type { AgentRun } from "./agent-run-store";

/** Reconcile durable task results on explicit project entry, not on a periodic poll. */
export async function recoverCanvasProjectForUser(userId: string, projectId: string) {
    const project = await getCanvasProjectForRecovery(projectId, userId);
    if (!project || isDramaLabCanvasProject(project)) return null;
    // Read task/event records before taking the project lock. Other users must
    // not wait for event pagination, and a single-connection pool must not deadlock.
    let page = 1;
    const runs: AgentRun[] = [];
    for (;;) {
        // Reuse the task repository's bounded paging contract; do not silently
        // drop older terminal runs after the first page.
        const result = await listStoredGenerationTaskRecords({ userId, projectId, type: "agent", surface: "canvas", page, pageSize: 100, includeAll: false });
        runs.push(...result.items.map((item) => item.payload as unknown as AgentRun));
        if (page * 100 >= result.total) break;
        page += 1;
    }
    const pending = runs.filter(
        (run) =>
            run.userId === userId && run.projectId === projectId && run.surface === "canvas" && ["completed", "partial_success", "failed", "cancelled"].includes(run.status) && project.__canvasAgentReceipts?.[run.id] !== canvasAgentResultFingerprint(run),
    );
    const replies = new Map<string, string>();
    for (const run of pending) {
        // Text-only conversations have no task result. Their authoritative
        // final response lives in the persisted terminal event.
        let cursor = "";
        for (;;) {
            const events = await listCreativeRunEvents(run.id, cursor);
            for (const event of events) {
                if (!["run.completed", "run.partial_success", "run.failed"].includes(event.type)) continue;
                const data = event.data as { reply?: unknown; message?: unknown } | undefined;
                const reply = data?.reply || data?.message;
                if (typeof reply === "string" && reply.trim()) replies.set(run.id, reply);
            }
            if (events.length < CREATIVE_RUN_EVENT_BATCH_SIZE) break;
            const next = events.at(-1)!.id;
            if (next === cursor) throw new Error("画布任务事件游标未推进");
            cursor = next;
        }
    }
    return mutateCanvasProjectForRecovery(userId, projectId, async (current) => recoverCanvasAgentResults(current, pending, userId, replies));
}
