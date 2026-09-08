import { createHash } from "node:crypto";
import type { CanvasProject } from "@/lib/canvas-project-contract";
import { CanvasNodeType, type CanvasAssistantMessage, type CanvasAssistantSession, type CanvasNodeData } from "@/app/(user)/canvas/types";
import { applyCanvasAgentOps, type CanvasAgentOp } from "@/app/(user)/canvas/utils/canvas-agent-ops";
import { isDramaLabCanvasProject } from "@/lib/drama-lab-canvas-contract";
import type { AgentRun } from "./agent-run-store";
import { cancelledRunCanvasOps, taskCanvasEventOps, taskResultOps } from "./agent-run-canvas-ops";
import { agentRunCompletionReply, agentRunFailureMessage } from "./agent-run-messages";

/** Server-owned receipts are persisted in the same project write as recovered outputs. */
export type CanvasRecoveryProject = CanvasProject & { __canvasAgentReceipts?: Record<string, string> };
const terminalStatuses = new Set(["completed", "partial_success", "failed", "cancelled"]);

export function canvasAgentResultFingerprint(run: AgentRun) {
    // Review/heartbeat timestamps are not new deliveries. A new attempt or result is.
    return createHash("sha256")
        .update(JSON.stringify({ status: run.status, tasks: run.tasks.map((t) => ({ id: t.id, status: t.status, attempts: t.attempts, target: t.targetNodeId, result: t.result, children: t.childTasks, error: t.error })) }))
        .digest("hex");
}

export function recoverCanvasAgentResults(project: CanvasRecoveryProject, runs: AgentRun[], ownerUserId: string, replies: ReadonlyMap<string, string> = new Map()): CanvasRecoveryProject {
    if (isDramaLabCanvasProject(project)) return project;
    let current = project;
    const ordered = runs.filter((run) => run.userId === ownerUserId && run.surface === "canvas" && run.projectId === project.id && terminalStatuses.has(run.status)).sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
    for (const run of ordered) {
        const fingerprint = canvasAgentResultFingerprint(run);
        if (current.__canvasAgentReceipts?.[run.id] === fingerprint) continue;
        const conflicts: string[] = [];
        const receipts = { ...current.__canvasAgentReceipts };
        const liveDelivered = new Set(
            current.chatSessions.flatMap((session) =>
                session.messages.flatMap((message) => {
                    if (message.runId !== run.id || message.role !== "assistant") return [];
                    const detail = message.detail as { nodeIds?: unknown } | undefined;
                    return Array.isArray(detail?.nodeIds) ? detail.nodeIds.filter((id): id is string => typeof id === "string") : [];
                }),
            ),
        );
        let nodes = current.nodes;
        let connections = current.connections;
        for (const [index, task] of run.tasks.entries()) {
            const receiptKey = `task:${run.id}:${task.id}`;
            const taskFingerprint = canvasAgentResultFingerprint({ ...run, status: "completed", tasks: [task] });
            if (receipts[receiptKey] === taskFingerprint) continue;
            const hasPartial = task.status === "cancelled" && task.childTasks?.some((child) => child.status === "completed");
            const result = hasPartial
                ? taskCanvasEventOps(run.id, index, { ...task, status: "failed", error: "任务已取消" }, "task.failed")
                : task.status === "completed"
                  ? taskResultOps(run.id, index, task)
                  : task.status === "failed"
                    ? taskCanvasEventOps(run.id, index, task, "task.failed")
                    : null;
            if (!result) {
                if (task.status === "cancelled") {
                    const ops = cancelledRunCanvasOps(run.id, run.tasks).filter((op) => nodes.some((n) => n.id === op.id && n.metadata?.agentRunId === run.id && !n.metadata?.content));
                    const applied = applyCanvasAgentOps({ projectId: current.id, title: current.title, nodes, connections, selectedNodeIds: [], viewport: current.viewport }, ops as CanvasAgentOp[]);
                    nodes = applied.nodes;
                    receipts[receiptKey] = taskFingerprint;
                }
                continue;
            }
            receipts[receiptKey] = taskFingerprint;
            for (const raw of result.ops) {
                const clean: Record<string, unknown> = { ...raw };
                if (clean.metadata && typeof clean.metadata === "object") {
                    const { prompt: _prompt, foundation: _foundation, resolvedPrompt: _resolvedPrompt, ...metadata } = clean.metadata as Record<string, unknown>;
                    clean.metadata = metadata;
                }
                const op = clean as CanvasAgentOp;
                if ((op.type === "add_node" || op.type === "update_node") && op.id?.startsWith(`output-${run.id}-`)) {
                    // A task can retry only one child: successful siblings must
                    // remain applied even when the parent result fingerprint changes.
                    if (liveDelivered.has(`canvas-conflict-${run.id}-${op.id}`)) continue;
                    const key = `output:${op.id}`;
                    const digest = createHash("sha256")
                        .update(JSON.stringify({ content: op.metadata?.content, status: op.metadata?.status }))
                        .digest("hex");
                    if (receipts[key] === digest) continue;
                    if (op.metadata?.status === "success" && op.metadata.content) receipts[key] = digest;
                    if (liveDelivered.has(op.id) && !nodes.some((node) => node.id === op.id)) continue;
                }
                if (op.type === "select_nodes" || op.type === "set_viewport") continue;
                if ((op.type === "add_node" || op.type === "update_node") && op.id?.startsWith(`task-${run.id}-`)) {
                    const id = op.id;
                    nodes = nodes.map((node) => (node.id === id && node.type === CanvasNodeType.Task && node.metadata?.agentRunId === run.id ? { ...node, metadata: { ...node.metadata, ...op.metadata } } : node));
                    continue;
                }
                let effective = op;
                if (op.type === "update_node" && op.id === task.targetNodeId) {
                    const target = nodes.find((n) => n.id === op.id);
                    // A delivered live conflict must not be duplicated or resurrected on entry.
                    if (liveDelivered.has(`canvas-conflict-${run.id}-${op.id}`) || liveDelivered.has(`recovered-${run.id}-${task.id}-0`)) continue;
                    if (liveDelivered.has(op.id) && (!target || target.metadata?.agentRunId === run.id)) continue;
                    const content = op.metadata?.content;
                    if (target?.metadata?.content === content && target?.metadata?.agentRunId === run.id) continue;
                    const original = snapshotText(run, op.id);
                    // Missing originals cannot establish safe overwrite authority.
                    if (!target || target.type !== task.type || original === undefined || (target.metadata?.content || target.metadata?.prompt || "") !== original) {
                        conflicts.push(task.title);
                        effective = {
                            type: "add_node",
                            id: `recovered-${run.id}-${task.id}-0`,
                            nodeType: task.type as CanvasNodeType,
                            title: `${task.title} · 待确认结果`,
                            metadata: { ...op.metadata, agentRunId: run.id, agentTaskId: task.id },
                            position: { x: 800, y: 96 + index * 300 },
                        };
                    }
                }
                const effectiveNodeId = "id" in effective ? effective.id : undefined;
                if (effective.type === "update_node" && !nodes.some((n) => n.id === effectiveNodeId)) {
                    // Completion updates may arrive without their earlier plan placeholders.
                    if (!effective.id.startsWith(`output-${run.id}-`)) continue;
                    effective = { type: "add_node", id: effective.id, nodeType: task.type as CanvasNodeType, title: effective.patch?.title || task.title, metadata: effective.metadata, position: { x: 800, y: 96 + index * 300 } };
                }
                if (effective.type === "add_node") {
                    const existing = nodes.find((n) => n.id === effectiveNodeId);
                    if (existing && !isUnfinishedOutput(existing, run.id)) {
                        if (existing.metadata?.agentRunId !== run.id) conflicts.push(task.title);
                        continue;
                    }
                }
                if (effective.type === "update_node" && effective.id !== task.targetNodeId) {
                    const existing = nodes.find((n) => n.id === effectiveNodeId);
                    if (existing && !isUnfinishedOutput(existing, run.id)) {
                        if (existing.metadata?.agentRunId !== run.id) conflicts.push(task.title);
                        continue;
                    }
                }
                if (effective.type === "connect_nodes") {
                    const { fromNodeId, toNodeId } = effective;
                    if (!nodes.some((n) => n.id === fromNodeId) || !nodes.some((n) => n.id === toNodeId)) continue;
                    effective = { ...effective, id: `agent-edge-${createHash("sha256").update(`${run.id}:${effective.fromNodeId}:${effective.toNodeId}`).digest("hex").slice(0, 24)}` };
                }
                const applied = applyCanvasAgentOps({ projectId: current.id, title: current.title, nodes, connections, selectedNodeIds: [], viewport: current.viewport }, [effective]);
                nodes = applied.nodes;
                connections = applied.connections;
            }
        }
        const reply = conflicts.length
            ? `生成结果已保留，但 ${conflicts.length} 个目标已被修改或删除，未覆盖当前内容。请查看待确认结果：${conflicts.join("、")}`
            : replies.get(run.id) || (run.status === "completed" && !run.tasks.length ? "" : completionReply(run));
        current = { ...current, nodes, connections, chatSessions: recoverConversation(current, run, reply), __canvasAgentReceipts: { ...receipts, [run.id]: fingerprint } };
    }
    return current;
}

function isUnfinishedOutput(node: CanvasNodeData, runId: string) {
    return node.metadata?.agentRunId === runId && !node.metadata?.content && ["loading", "idle", "error", "needs_review", "cancelled"].includes(node.metadata?.status || "");
}

function snapshotText(run: AgentRun, id: string): string | undefined {
    const snapshot = run.snapshot as { nodes?: Array<{ id: string; metadata?: { content?: string; prompt?: string } }> } | undefined;
    const original = snapshot?.nodes?.find((n) => n.id === id);
    return original ? original.metadata?.content || original.metadata?.prompt || "" : undefined;
}

function completionReply(run: AgentRun) {
    if (run.status === "cancelled") return "Agent 任务已取消，已产生的结果已保留。";
    if (run.status === "failed") return agentRunFailureMessage(run.tasks);
    if (run.status === "partial_success") return `部分任务成功，已保留可用结果。\n${agentRunFailureMessage(run.tasks)}`;
    return agentRunCompletionReply(run);
}

function recoverConversation(project: CanvasProject, run: AgentRun, reply: string): CanvasAssistantSession[] {
    const found = project.chatSessions.find((s) => s.conversationId === run.conversationId || s.messages.some((m) => m.runId === run.id));
    const now = new Date(run.updatedAt).toISOString();
    const previous = found?.messages.find((m) => m.runId === run.id && m.role !== "user");
    // Do not replace a completed ordinary conversation with a generic task summary.
    const text = run.status === "completed" && !run.tasks.length && !reply ? previous?.text || "任务已结束，但最终回复暂不可恢复，请查看创作历史。" : reply;
    const message: CanvasAssistantMessage = { ...previous, id: previous?.id || run.assistantMessageId, runId: run.id, role: run.status === "failed" ? "error" : "assistant", text };
    const existingMessages = found?.messages || [];
    const hasInput = existingMessages.some((m) => m.role === "user" && (m.id === run.inputMessageId || m.runId === run.id)) || Boolean(previous);
    const inputs: CanvasAssistantMessage[] = hasInput ? existingMessages : [...existingMessages, { id: run.inputMessageId, role: "user", text: run.prompt, runId: run.id }];
    const messages = previous ? inputs.map((m) => (m.id === previous.id ? message : m)) : [...inputs, message];
    const session: CanvasAssistantSession = found
        ? { ...found, messages, updatedAt: now }
        : { id: `recovered-${run.conversationId}`, conversationId: run.conversationId, title: run.prompt.slice(0, 36), createdAt: new Date(run.createdAt).toISOString(), updatedAt: now, messages };
    return found ? project.chatSessions.map((s) => (s.id === found.id ? session : s)) : [...project.chatSessions, session];
}
