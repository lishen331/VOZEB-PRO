import { describe, expect, it } from "vitest";
import { CanvasNodeType } from "@/app/(user)/canvas/types";
import { createCanvasDestructiveProposal, previewCanvasDestructiveProposal, applyConfirmedCanvasDestructiveProposal } from "./canvas-agent-destructive";
const nodes = ["a", "b", "c"].map((id) => ({ id, title: id, type: CanvasNodeType.Text, position: { x: 0, y: 0 }, width: 300, height: 200, metadata: { content: id } }));
const connections = [
    { id: "ab", fromNodeId: "a", toNodeId: "b" },
    { id: "bc", fromNodeId: "b", toNodeId: "c" },
];
const graph = { nodes, connections };
describe("Canvas destructive confirmation", () => {
    it("does not execute the same approved deletion twice", () => {
        const p = createCanvasDestructiveProposal("r", { type: "delete_nodes", ids: ["a"] }, graph, []);
        const preview = previewCanvasDestructiveProposal(graph, p);
        const deleted = applyConfirmedCanvasDestructiveProposal(graph, p, preview);
        expect(() => applyConfirmedCanvasDestructiveProposal(deleted, p, preview)).toThrow();
    });
    it("rejects replacing an edge with the same id but different endpoints", () => {
        const p = createCanvasDestructiveProposal("r", { type: "disconnect", ids: ["ab"] }, graph, []);
        const preview = previewCanvasDestructiveProposal(graph, p);
        expect(() => applyConfirmedCanvasDestructiveProposal({ ...graph, connections: [{ ...connections[0], toNodeId: "c" }, connections[1]] }, p, preview)).toThrow();
    });

    it("proposes exact deletion without modifying graph, includes incident links in preview", () => {
        const p = createCanvasDestructiveProposal("r", { type: "delete_nodes", ids: ["a"] }, graph, ["a"]);
        const preview = previewCanvasDestructiveProposal(graph, p);
        expect(graph.nodes).toHaveLength(3);
        expect(preview.nodes.map((n) => n.id)).toEqual(["a"]);
        expect(preview.connections.map((c) => c.id)).toEqual(["ab"]);
        const applied = applyConfirmedCanvasDestructiveProposal(graph, p, preview);
        expect(applied.nodes.map((n) => n.id)).toEqual(["b", "c"]);
        expect(applied.connections).toEqual([connections[1]]);
    });
    it("disconnects links without deleting nodes", () => {
        const p = createCanvasDestructiveProposal("r", { type: "disconnect", ids: ["ab"] }, graph, []);
        const next = applyConfirmedCanvasDestructiveProposal(graph, p, previewCanvasDestructiveProposal(graph, p));
        expect(next.nodes).toBe(nodes);
        expect(next.connections).toEqual([connections[1]]);
    });
    it("rejects foreign or unselected nodes and unknown connections", () => {
        expect(() => createCanvasDestructiveProposal("r", { type: "delete_nodes", ids: ["ghost"] }, graph, [])).toThrow();
        expect(() => createCanvasDestructiveProposal("r", { type: "delete_nodes", ids: ["c"] }, graph, ["a"])).toThrow();
        expect(() => createCanvasDestructiveProposal("r", { type: "disconnect", ids: ["bc"] }, graph, ["a"])).toThrow();
    });
    it.each(["edit", "delete", "new-edge"])("rejects %s after the confirmation preview", (kind) => {
        const p = createCanvasDestructiveProposal("r", { type: "delete_nodes", ids: ["a"] }, graph, []);
        const preview = previewCanvasDestructiveProposal(graph, p);
        const changed =
            kind === "edit"
                ? { ...graph, nodes: nodes.map((n) => (n.id === "a" ? { ...n, metadata: { content: "new" } } : n)) }
                : kind === "delete"
                  ? { ...graph, nodes: nodes.slice(1) }
                  : { ...graph, connections: [...connections, { id: "ac", fromNodeId: "a", toNodeId: "c" }] };
        expect(() => applyConfirmedCanvasDestructiveProposal(changed, p, preview)).toThrow();
    });
    it("allows unrelated edits and keeps their content", () => {
        const p = createCanvasDestructiveProposal("r", { type: "delete_nodes", ids: ["a"] }, graph, []);
        const preview = previewCanvasDestructiveProposal(graph, p);
        const changed = { ...graph, nodes: nodes.map((n) => (n.id === "c" ? { ...n, metadata: { content: "new" } } : n)) };
        expect(applyConfirmedCanvasDestructiveProposal(changed, p, preview).nodes.at(-1)?.metadata?.content).toBe("new");
    });
    it("refuses deleting active generation nodes", () => {
        const active = { ...graph, nodes: nodes.map((n) => ({ ...n, metadata: { ...n.metadata, status: "loading" as const } })) };
        expect(() => createCanvasDestructiveProposal("r", { type: "delete_nodes", ids: ["a"] }, active, [])).toThrow();
    });
});
