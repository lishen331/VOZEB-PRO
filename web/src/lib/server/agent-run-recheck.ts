import { getStoredGenerationTaskRecord } from "./generation-task-store";
import { updateAgentRunById, type AgentRun, type AgentRunChildTask } from "./agent-run-store";
import { scheduleGenerationTask } from "./generation-task-scheduler";

/** Reconcile only previously submitted children. This never creates media. */
export async function recheckAgentRun(run: AgentRun): Promise<AgentRun> {
    if (run.status !== "paused" || run.cancellation) throw new Error("只有暂停且未取消的任务可以重新检查");
    let canContinue = false;
    const tasks = [];
    const polls: Array<{ type: AgentRun["tasks"][number]["type"]; id: string; upstreamTaskId: string }> = [];
    for (const task of run.tasks) {
        if (!["running", "needs_review"].includes(task.status)) {
            tasks.push(task);
            continue;
        }
        const children: AgentRunChildTask[] = task.childTasks?.length ? task.childTasks : (task.taskIds?.length ? task.taskIds : task.taskId ? [task.taskId] : []).map((id) => ({ id, status: "pending", attempt: Math.max(1, task.attempts) }));
        let actionable = false;
        for (const child of children) {
            if (child.status === "completed") {
                actionable = true;
                continue;
            }
            if (child.status === "failed" || child.status === "cancelled") continue;
            const record = await getStoredGenerationTaskRecord(task.type, child.id);
            if (!record || record.userId !== run.userId) throw new Error("原子任务不存在或不属于该用户");
            if (["success", "error", "cancelled"].includes(record.status) || ["submitted", "polling", "result_ready", "persisting"].includes(record.executionPhase || "")) {
                actionable = true;
                continue;
            }
            if (record.upstreamTaskId && record.executionPhase === "needs_review") {
                polls.push({ type: task.type, id: child.id, upstreamTaskId: record.upstreamTaskId });
                actionable = true;
            }
        }
        canContinue ||= actionable;
        tasks.push({ ...task, childTasks: children, status: actionable ? ("running" as const) : ("needs_review" as const) });
    }
    if (!canContinue) return run;
    const updated = await updateAgentRunById(run.id, { status: "running", tasks, executionId: undefined }, { type: "run.recheck.requested" }, ["paused"]);
    if (!updated) throw new Error("任务状态已变化，请刷新后重新检查");
    // Validate every child before any scheduling side effect.
    for (const poll of polls) await scheduleGenerationTask(poll.type, poll.id, { executionPhase: "polling", upstreamTaskId: poll.upstreamTaskId, nextPollAt: Date.now() });
    return updated;
}
