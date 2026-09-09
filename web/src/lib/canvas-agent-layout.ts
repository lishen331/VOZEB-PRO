import type { CanvasConnection, CanvasNodeData } from "@/app/(user)/canvas/types";
import { autoLayoutCanvas, isAgentInternalNode } from "@/app/(user)/canvas/utils/canvas-auto-layout";
import { findFreeNodePosition } from "@/app/(user)/canvas/utils/canvas-agent-ops";
export type CanvasLayoutRequest = { type: "layout"; scope: "all" | "selected" };
export type CanvasLayoutGeometry = Pick<CanvasNodeData, "id" | "type" | "position" | "width" | "height">;
export type CanvasLayoutSnapshot = { nodes: CanvasLayoutGeometry[]; selectedNodeIds: string[]; connections: CanvasConnection[] };
export type CanvasLayoutOperation = { id: string; type: "layout"; scope: "all" | "selected"; before: CanvasLayoutGeometry[]; context: CanvasLayoutGeometry[]; after: Array<{ id: string; position: { x: number; y: number } }> };
export function canvasLayoutGeometry(nodes: CanvasNodeData[]): CanvasLayoutGeometry[] {
    return nodes.map(({ id, type, position, width, height }) => ({ id, type, position, width, height }));
}
export function validateCanvasLayoutSnapshot(value: unknown): asserts value is CanvasLayoutSnapshot {
    const s = value as CanvasLayoutSnapshot;
    if (
        !s ||
        !Array.isArray(s.nodes) ||
        !Array.isArray(s.selectedNodeIds) ||
        !Array.isArray(s.connections) ||
        s.selectedNodeIds.some((id) => typeof id !== "string") ||
        s.nodes.some(
            (n) => !n || typeof n.id !== "string" || !n.id || typeof n.type !== "string" || !Number.isFinite(n.position?.x) || !Number.isFinite(n.position?.y) || !Number.isFinite(n.width) || n.width <= 0 || !Number.isFinite(n.height) || n.height <= 0,
        ) ||
        new Set(s.nodes.map((n) => n.id)).size !== s.nodes.length ||
        s.connections.some((c) => !c || typeof c.fromNodeId !== "string" || typeof c.toNodeId !== "string")
    )
        throw new Error("画布布局快照无效，请重新提交");
}
export function planCanvasAgentLayout(runId: string, request: CanvasLayoutRequest, snapshot: CanvasLayoutSnapshot, realNodes: CanvasNodeData[]): CanvasLayoutOperation {
    validateCanvasLayoutSnapshot(snapshot);
    const real = new Map(realNodes.map((n) => [n.id, n]));
    const source = new Map(snapshot.nodes.map((n) => [n.id, n]));
    if (snapshot.nodes.some((n) => !real.has(n.id) || real.get(n.id)!.type !== n.type) || snapshot.selectedNodeIds.some((id) => !source.has(id))) throw new Error("画布节点已改变或不存在，请重新提交整理");
    const selected = new Set(snapshot.selectedNodeIds);
    if (request.scope === "selected" && !selected.size) throw new Error("请先选中需要整理的节点");
    const inputs = snapshot.nodes.map((n) => ({ ...real.get(n.id)!, ...n }));
    const targets = inputs.filter((n) => !isAgentInternalNode(n) && (request.scope === "all" || selected.has(n.id)));
    const ids = new Set(targets.map((n) => n.id));
    const arranged = autoLayoutCanvas(request.scope === "all" ? inputs : inputs.filter((n) => ids.has(n.id)), snapshot.connections).filter((n) => ids.has(n.id));
    if (request.scope === "selected" && arranged.length) {
        const left = Math.min(...arranged.map((n) => n.position.x)),
            top = Math.min(...arranged.map((n) => n.position.y));
        const width = Math.max(...arranged.map((n) => n.position.x + n.width)) - left,
            height = Math.max(...arranged.map((n) => n.position.y + n.height)) - top;
        const anchor = findFreeNodePosition(
            inputs.filter((n) => !ids.has(n.id)),
            { x: Math.min(...targets.map((n) => n.position.x)), y: Math.min(...targets.map((n) => n.position.y)) },
            width,
            height,
        );
        arranged.forEach((n) => {
            n.position = { x: n.position.x + anchor.x - left, y: n.position.y + anchor.y - top };
        });
    }
    return { id: `layout-${runId}`, type: "layout", scope: request.scope, before: canvasLayoutGeometry(targets), context: snapshot.nodes, after: arranged.map((n) => ({ id: n.id, position: n.position })) };
}
function equalGeometry(n: CanvasNodeData, original: CanvasLayoutGeometry) {
    return n.type === original.type && n.width === original.width && n.height === original.height && n.position.x === original.position.x && n.position.y === original.position.y;
}
export function applyCanvasAgentLayout(nodes: CanvasNodeData[], operation: CanvasLayoutOperation): { nodes: CanvasNodeData[]; status: "applied" | "unchanged" | "conflict" } {
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const after = new Map(operation.after.map((n) => [n.id, n.position]));
    if (
        !operation.after.length ||
        operation.before.every((n) => {
            const current = byId.get(n.id);
            return current && after.has(n.id) && equalGeometry(current, { ...n, position: after.get(n.id)! });
        })
    )
        return { nodes, status: "unchanged" };
    if (nodes.length !== operation.context.length || operation.context.some((n) => !byId.has(n.id) || !equalGeometry(byId.get(n.id)!, n))) return { nodes, status: "conflict" };
    if (operation.before.some((n) => !byId.has(n.id) || !equalGeometry(byId.get(n.id)!, n))) return { nodes, status: "conflict" };
    return { nodes: nodes.map((n) => (after.has(n.id) ? { ...n, position: after.get(n.id)! } : n)), status: "applied" };
}
