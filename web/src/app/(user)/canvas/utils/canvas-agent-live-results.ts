import { CanvasNodeType, type CanvasNodeData } from "../types";
import { applyCanvasAgentOps, type CanvasAgentOp, type CanvasAgentSnapshot } from "./canvas-agent-ops";

/** Per-run delivery guard. Originals are captured before the create request, never on reconnect. */
export function createCanvasAgentLiveGuard(runId: string, original?: CanvasAgentSnapshot) {
    return {
        runId,
        expected: new Map(original?.nodes.map((node) => [node.id, node])),
        seen: new Set<string>(),
        completed: new Map<string, string>(),
        conflictCounts: new Map<string, number>(),
        conflictNodeIds: new Set<string>(),
        outputNodeIds: new Set<string>(),
    };
}
export type CanvasAgentLiveGuard = ReturnType<typeof createCanvasAgentLiveGuard>;
function sameContent(left: CanvasNodeData, right: CanvasNodeData) {
    return left.type === right.type && (left.metadata?.content || "") === (right.metadata?.content || "") && (left.metadata?.prompt || "") === (right.metadata?.prompt || "");
}

/** Called against nodesRef synchronously, not a potentially stale React render snapshot. */
export function guardCanvasAgentLiveOps(snapshot: CanvasAgentSnapshot, ops: CanvasAgentOp[], guard: CanvasAgentLiveGuard): CanvasAgentOp[] {
    let current = snapshot;
    const accepted: CanvasAgentOp[] = [];
    for (const op of ops) {
        if (op.type !== "add_node" && op.type !== "update_node") {
            // Background results must not steal the user's current selection or viewport.
            if (op.type !== "select_nodes" && op.type !== "set_viewport") accepted.push(op);
            continue;
        }
        if (!op.id) continue;
        const id = op.id;
        const metadata = { ...(op.type === "update_node" ? op.patch?.metadata : {}), ...op.metadata };
        const existing = current.nodes.find((node) => node.id === id);
        const expected = guard.expected.get(id);
        const result = metadata.status === "success" && typeof metadata.content === "string";
        const fingerprint = JSON.stringify(op);
        if (guard.seen.has(fingerprint)) continue;
        guard.seen.add(fingerprint);
        if (!result && guard.completed.has(id)) continue;
        let effective: CanvasAgentOp = op;
        if (result) {
            guard.outputNodeIds.add(id);
            if (guard.completed.get(id) === metadata.content) continue;
            guard.completed.set(id, metadata.content!);
            // A replay on a freshly reopened page may already have been applied before disconnect.
            if (existing?.metadata?.agentRunId === guard.runId && existing.metadata?.status === "success" && existing.metadata?.content === metadata.content) continue;
            const unchanged = existing && expected && sameContent(existing, expected);
            const newOutput = !existing && !expected && op.type === "add_node";
            if (!unchanged && !newOutput) {
                const baseAlternateId = metadata.agentTaskId && !id.startsWith(`output-${guard.runId}-`) ? `recovered-${guard.runId}-${metadata.agentTaskId}-0` : `canvas-conflict-${guard.runId}-${id}`;
                const count = guard.conflictCounts.get(id) || 0;
                guard.conflictCounts.set(id, count + 1);
                let alternateId = count ? `${baseAlternateId}-${count}` : baseAlternateId;
                // A distinct retry is another deliverable; never overwrite an earlier reviewed alternative.
                while (current.nodes.some((node) => node.id === alternateId && node.metadata?.content !== metadata.content)) alternateId += "-next";
                guard.conflictNodeIds.add(alternateId);
                guard.outputNodeIds.add(alternateId);
                if (current.nodes.some((node) => node.id === alternateId)) continue;
                const nodeType = op.type === "add_node" ? op.nodeType : expected?.type || (metadata.agentTaskType as CanvasNodeType | undefined) || CanvasNodeType.Text;
                effective = {
                    type: "add_node",
                    id: alternateId,
                    nodeType,
                    title: `${op.type === "add_node" ? op.title || "生成结果" : expected?.title || "生成结果"} · 待确认结果`,
                    position: { x: (existing?.position.x || expected?.position.x || 400) + 400, y: existing?.position.y || expected?.position.y || 96 },
                    metadata: { ...metadata, agentRunId: guard.runId },
                };
            }
        } else {
            // Replayed plans/status updates may not resurrect deleted nodes or reset user edits.
            if (expected && (!existing || !sameContent(existing, expected))) continue;
            if (existing && !expected) continue;
        }
        accepted.push(effective);
        current = applyCanvasAgentOps(current, [effective]);
        const appliedId = effective.id;
        const applied = current.nodes.find((node) => node.id === appliedId);
        if (applied) guard.expected.set(appliedId!, applied);
    }
    return accepted;
}
