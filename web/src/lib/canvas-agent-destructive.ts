import type { CanvasNodeData, CanvasConnection } from "@/app/(user)/canvas/types";
import { isAgentInternalNode } from "@/app/(user)/canvas/utils/canvas-auto-layout";
export type CanvasDestructiveRequest = { type: "delete_nodes" | "disconnect"; ids: string[] };
export type CanvasDestructiveProposal = CanvasDestructiveRequest & { id: string; runId: string };
type Graph = { nodes: CanvasNodeData[]; connections: CanvasConnection[] };
export type CanvasDestructivePreview = Graph;
export function isCanvasDestructiveRequest(value: unknown): value is CanvasDestructiveRequest {
    const v = value as CanvasDestructiveRequest;
    return Boolean(v && ["delete_nodes", "disconnect"].includes(v.type) && Array.isArray(v.ids) && v.ids.length && v.ids.every((id) => typeof id === "string" && id.trim() && id !== "*") && new Set(v.ids).size === v.ids.length);
}
export function createCanvasDestructiveProposal(runId: string, request: CanvasDestructiveRequest, graph: Graph, selectedNodeIds: string[]): CanvasDestructiveProposal {
    if (!isCanvasDestructiveRequest(request)) throw new Error("请选择明确的节点或连线，不能使用空目标或通配符");
    const selected = new Set(selectedNodeIds);
    const proposal = { ...request, ids: [...request.ids], id: `confirm-${runId}`, runId };
    const preview = previewCanvasDestructiveProposal(graph, proposal);
    if (selected.size && (request.type === "delete_nodes" ? request.ids.some((id) => !selected.has(id)) : preview.connections.some((c) => !selected.has(c.fromNodeId) && !selected.has(c.toNodeId)))) throw new Error("操作目标超出当前选中范围");
    return proposal;
}
export function previewCanvasDestructiveProposal(graph: Graph, proposal: CanvasDestructiveProposal): CanvasDestructivePreview {
    if (!isCanvasDestructiveRequest(proposal)) throw new Error("无效的待确认操作");
    const ids = new Set(proposal.ids);
    const nodes = proposal.type === "delete_nodes" ? graph.nodes.filter((n) => ids.has(n.id)) : [];
    const connections = graph.connections.filter((c) => (proposal.type === "disconnect" ? ids.has(c.id) : ids.has(c.fromNodeId) || ids.has(c.toNodeId)));
    if ((proposal.type === "delete_nodes" ? nodes.length : connections.length) !== ids.size) throw new Error("操作目标已不存在，请重新提出需求");
    if (nodes.some((n) => isAgentInternalNode(n) || ["loading", "needs_review"].includes(n.metadata?.status || ""))) throw new Error("不能删除内部节点或仍在执行/待确认的任务节点，请先处理任务");
    // Immutable preview: later in-place mutations must not rewrite the approved scope.
    return structuredClone({ nodes, connections });
}
export function applyConfirmedCanvasDestructiveProposal(graph: Graph, proposal: CanvasDestructiveProposal, approved: CanvasDestructivePreview): Graph {
    const latest = previewCanvasDestructiveProposal(graph, proposal);
    const same = <T extends { id: string }>(a: T[], b: T[]) => a.length === b.length && a.every((item) => JSON.stringify(item) === JSON.stringify(b.find((other) => other.id === item.id)));
    if (!same(latest.nodes, approved.nodes) || !same(latest.connections, approved.connections)) throw new Error("目标内容或关联连线在预览后发生变化，未执行；请重新查看影响");
    const ids = new Set(proposal.ids),
        edges = new Set(approved.connections.map((c) => c.id));
    return { nodes: proposal.type === "delete_nodes" ? graph.nodes.filter((n) => !ids.has(n.id)) : graph.nodes, connections: graph.connections.filter((c) => !edges.has(c.id)) };
}
