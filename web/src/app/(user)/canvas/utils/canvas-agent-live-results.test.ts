import { planCanvasAgentLayout, canvasLayoutGeometry } from "@/lib/canvas-agent-layout";
import { describe, expect, it } from "vitest";
import { CanvasNodeType } from "../types";
import { applyCanvasAgentOps, type CanvasAgentSnapshot, type CanvasAgentOp } from "./canvas-agent-ops";
import { createCanvasAgentLiveGuard, guardCanvasAgentLiveOps } from "./canvas-agent-live-results";
const original: CanvasAgentSnapshot = {
    projectId: "p",
    title: "Canvas",
    nodes: [{ id: "text", type: CanvasNodeType.Text, title: "Original", position: { x: 0, y: 0 }, width: 300, height: 200, metadata: { content: "before", prompt: "before" } }],
    connections: [],
    selectedNodeIds: [],
    viewport: { x: 0, y: 0, k: 1 },
};
const result: CanvasAgentOp = { type: "update_node", id: "text", metadata: { content: "generated", prompt: "generated", status: "success", agentRunId: "run" } };
function apply(current: CanvasAgentSnapshot, guard: ReturnType<typeof createCanvasAgentLiveGuard>, ops: CanvasAgentOp[] = [result]) {
    return applyCanvasAgentOps(current, guardCanvasAgentLiveOps(current, ops, guard));
}
describe("live Canvas Agent result guard", () => {
    it("never executes destructive ops received directly from the event stream", () => {
        const ops: CanvasAgentOp[] = [
            { type: "delete_node", ids: ["text"] },
            { type: "delete_connections", all: true },
            { type: "confirmed_destructive", proposal: { id: "p", runId: "run", type: "delete_nodes", ids: ["text"] }, preview: { nodes: original.nodes, connections: [] } },
        ];
        expect(apply(original, createCanvasAgentLiveGuard("run", original), ops).nodes).toEqual(original.nodes);
    });

    it("does not reapply a layout event after the user undoes it", () => {
        const guard = createCanvasAgentLiveGuard("run", original);
        const operation = planCanvasAgentLayout("run", { type: "layout", scope: "all" }, { nodes: canvasLayoutGeometry(original.nodes), connections: [], selectedNodeIds: [] }, original.nodes);
        const ops: CanvasAgentOp[] = [{ type: "layout_nodes", operation }];
        expect(apply(original, guard, ops).nodes[0].position).not.toEqual(original.nodes[0].position);
        expect(apply(original, guard, ops).nodes).toEqual(original.nodes);
    });

    it("preserves each distinct retried conflict result instead of silently dropping it", () => {
        const guard = createCanvasAgentLiveGuard("run", original);
        const first = apply({ ...original, nodes: [] }, guard);
        const next = apply(first, guard, [{ ...result, metadata: { ...result.metadata, content: "second result", prompt: "second result" } }]);
        expect(next.nodes.map((n) => n.metadata?.content)).toEqual(["generated", "second result"]);
    });
    it("preserves an empty generated text result when the target was deleted", () => {
        const next = apply({ ...original, nodes: [] }, createCanvasAgentLiveGuard("run", original), [{ ...result, metadata: { ...result.metadata, content: "", prompt: "" } }]);
        expect(next.nodes).toHaveLength(1);
    });
    it("retains edited media rather than overwrite it", () => {
        const source = { ...original, nodes: [{ ...original.nodes[0], type: CanvasNodeType.Image, metadata: { content: "/old.png" } }] };
        const edited = { ...source, nodes: [{ ...source.nodes[0], metadata: { content: "/manual.png" } }] };
        const next = apply(edited, createCanvasAgentLiveGuard("run", source), [{ ...result, metadata: { status: "success", agentRunId: "run", content: "/generated.png", agentTaskType: "image" } }]);
        expect(next.nodes.map((n) => n.metadata?.content)).toEqual(["/manual.png", "/generated.png"]);
    });

    it("updates untouched text without moving or resizing it", () => {
        const moved = { ...original, nodes: original.nodes.map((n) => ({ ...n, position: { x: 600, y: 400 }, width: 500 })) };
        expect(apply(moved, createCanvasAgentLiveGuard("run", original)).nodes[0]).toMatchObject({ position: { x: 600, y: 400 }, width: 500, metadata: { content: "generated" } });
    });
    it.each(["edited", "deleted", "type", "prompt"])("retains %s target and adds a separate result", (mode) => {
        const guard = createCanvasAgentLiveGuard("run", original);
        const current = {
            ...original,
            nodes:
                mode === "deleted"
                    ? []
                    : original.nodes.map((n) => ({ ...n, type: mode === "type" ? CanvasNodeType.Image : n.type, metadata: { ...n.metadata, ...(mode === "edited" ? { content: "mine" } : {}), ...(mode === "prompt" ? { prompt: "mine" } : {}) } })),
        };
        const next = apply(current, guard);
        expect(next.nodes.slice(0, current.nodes.length)).toEqual(current.nodes);
        expect(next.nodes.at(-1)).toMatchObject({ id: "canvas-conflict-run-text", type: CanvasNodeType.Text, metadata: { content: "generated" } });
        expect(guard.conflictNodeIds.has("canvas-conflict-run-text")).toBe(true);
    });
    it("does not overwrite or resurrect already delivered results on replay", () => {
        const guard = createCanvasAgentLiveGuard("run", original);
        const first = apply(original, guard);
        const edited = { ...first, nodes: first.nodes.map((n) => ({ ...n, metadata: { ...n.metadata, content: "correction" } })) };
        expect(apply(edited, guard).nodes).toEqual(edited.nodes);
        expect(apply({ ...first, nodes: [] }, guard).nodes).toEqual([]);
    });
    it("does not overwrite pending alternatives on duplicate events", () => {
        const guard = createCanvasAgentLiveGuard("run", original);
        const first = apply({ ...original, nodes: [] }, guard);
        const edited = { ...first, nodes: first.nodes.map((n) => ({ ...n, metadata: { ...n.metadata, content: "reviewed" } })) };
        expect(apply(edited, guard).nodes).toEqual(edited.nodes);
    });
    it("uses conservative alternatives when original snapshot is unavailable", () => {
        const next = apply(original, createCanvasAgentLiveGuard("run"));
        expect(next.nodes[0]).toEqual(original.nodes[0]);
        expect(next.nodes).toHaveLength(2);
    });
    it("protects deleted media placeholders and prevents replayed plans resetting success", () => {
        const plan: CanvasAgentOp = { type: "add_node", id: "output-run-0-0", nodeType: CanvasNodeType.Image, metadata: { status: "loading", agentRunId: "run", agentTaskType: "image" } };
        const finish: CanvasAgentOp = { type: "update_node", id: "output-run-0-0", metadata: { content: "/image.png", status: "success", agentRunId: "run", agentTaskType: "image" } };
        const guard = createCanvasAgentLiveGuard("run", original);
        const planned = apply(original, guard, [plan]);
        const completed = apply(planned, guard, [finish]);
        expect(apply(completed, guard, [plan]).nodes).toEqual(completed.nodes);
        const other = createCanvasAgentLiveGuard("run", original);
        apply(original, other, [plan]);
        expect(apply(original, other, [finish]).nodes.at(-1)).toMatchObject({ id: "canvas-conflict-run-output-run-0-0", type: CanvasNodeType.Image, metadata: { content: "/image.png" } });
    });
    it("does not revive deleted plan nodes on replay", () => {
        const guard = createCanvasAgentLiveGuard("run", original);
        const plan: CanvasAgentOp = { type: "add_node", id: "output-run-0-0", nodeType: CanvasNodeType.Image, metadata: { status: "loading", agentRunId: "run" } };
        apply(original, guard, [plan]);
        expect(apply(original, guard, [plan]).nodes).toEqual(original.nodes);
    });
});
