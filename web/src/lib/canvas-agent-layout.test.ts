import { describe, expect, it } from "vitest";
import { CanvasNodeType, type CanvasNodeData } from "@/app/(user)/canvas/types";
import { planCanvasAgentLayout, applyCanvasAgentLayout, canvasLayoutGeometry } from "./canvas-agent-layout";
const node = (id: string, x = 0): CanvasNodeData => ({ id, type: CanvasNodeType.Text, title: id, position: { x, y: 0 }, width: 300, height: 200, metadata: { content: id } });
const nodes = [node("a"), node("b"), node("outside", 900)];
const connections = [{ id: "ab", fromNodeId: "a", toNodeId: "b" }];
const snapshot = () => ({ nodes: canvasLayoutGeometry(nodes), connections, selectedNodeIds: ["a", "b"] });
describe("Canvas Agent layout operation", () => {
    it("rejects changed obstacles or newly added nodes while selected layout is pending", () => {
        const op = planCanvasAgentLayout("run", { type: "layout", scope: "selected" }, snapshot(), nodes);
        expect(applyCanvasAgentLayout([...nodes, node("new")], op).status).toBe("conflict");
        expect(
            applyCanvasAgentLayout(
                nodes.map((n) => (n.id === "outside" ? { ...n, position: { x: 96, y: 96 } } : n)),
                op,
            ).status,
        ).toBe("conflict");
    });
    it("repeated selected layout is stable", () => {
        const first = applyCanvasAgentLayout(nodes, planCanvasAgentLayout("one", { type: "layout", scope: "selected" }, snapshot(), nodes)).nodes;
        const second = planCanvasAgentLayout("two", { type: "layout", scope: "selected" }, { ...snapshot(), nodes: canvasLayoutGeometry(first) }, first);
        expect(applyCanvasAgentLayout(first, second).status).toBe("unchanged");
    });

    it("plans selected nodes only and changes only positions", () => {
        const operation = planCanvasAgentLayout("run", { type: "layout", scope: "selected" }, snapshot(), nodes);
        const next = applyCanvasAgentLayout(nodes, operation);
        expect(next.status).toBe("applied");
        expect(next.nodes[2]).toBe(nodes[2]);
        expect(next.nodes.map((n) => ({ ...n, position: undefined }))).toEqual(nodes.map((n) => ({ ...n, position: undefined })));
        expect(next.nodes[0].position).not.toEqual(next.nodes[1].position);
    });
    it("does not overlap selected outputs with unselected nodes", () => {
        const occupied = [node("a"), node("b"), { ...node("outside", 0), width: 5000, height: 5000 }];
        const op = planCanvasAgentLayout("run", { type: "layout", scope: "selected" }, { ...snapshot(), nodes: canvasLayoutGeometry(occupied) }, occupied);
        const result = applyCanvasAgentLayout(occupied, op);
        expect(result.nodes[2]).toBe(occupied[2]);
        expect(result.nodes.slice(0, 2).every((n) => n.position.x >= 5000 || n.position.y >= 5000)).toBe(true);
    });
    it.each(["move", "delete", "resize"])("rejects stale %s geometry without partial movement", (mode) => {
        const op = planCanvasAgentLayout("run", { type: "layout", scope: "all" }, snapshot(), nodes);
        const current = mode === "delete" ? nodes.slice(1) : nodes.map((n) => (n.id === "b" ? { ...n, ...(mode === "resize" ? { width: 400 } : { position: { x: 700, y: 900 } }) } : n));
        const result = applyCanvasAgentLayout(current, op);
        expect(result.status).toBe("conflict");
        expect(result.nodes).toBe(current);
    });
    it("keeps concurrent text edits and recognizes duplicate delivery", () => {
        const op = planCanvasAgentLayout("run", { type: "layout", scope: "all" }, snapshot(), nodes);
        const current = nodes.map((n) => ({ ...n, metadata: { content: "edited" } }));
        const result = applyCanvasAgentLayout(current, op);
        expect(result.nodes.every((n) => n.metadata?.content === "edited")).toBe(true);
        expect(applyCanvasAgentLayout(result.nodes, op).status).toBe("unchanged");
    });
    it("rejects unknown selected ids and invalid geometry", () => {
        expect(() => planCanvasAgentLayout("run", { type: "layout", scope: "selected" }, { ...snapshot(), selectedNodeIds: ["ghost"] }, nodes)).toThrow();
        expect(() => planCanvasAgentLayout("run", { type: "layout", scope: "all" }, { ...snapshot(), nodes: [{ ...canvasLayoutGeometry(nodes)[0], width: Infinity }] }, nodes)).toThrow();
    });
    it("handles empty and cyclic canvases without creating nodes", () => {
        const empty = planCanvasAgentLayout("run", { type: "layout", scope: "all" }, { nodes: [], connections: [], selectedNodeIds: [] }, []);
        expect(applyCanvasAgentLayout([], empty).status).toBe("unchanged");
        const op = planCanvasAgentLayout("run", { type: "layout", scope: "all" }, { ...snapshot(), connections: [...connections, { id: "ba", fromNodeId: "b", toNodeId: "a" }] }, nodes);
        expect(applyCanvasAgentLayout(nodes, op).nodes).toHaveLength(3);
    });
});
