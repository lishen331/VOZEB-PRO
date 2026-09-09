import { describe, it, expect } from "vitest";
import { normalizeAgentRunCanvasSnapshot, canvasSnapshotPlannerView } from "./agent-run-canvas-snapshot";
describe("Canvas layout geometry snapshot", () => {
    it("retains all geometry independently of selected content, and strips content smuggled into geometry", () => {
        const a = { id: "a", type: "text", title: "A", position: { x: 0, y: 0 }, width: 300, height: 200, metadata: { content: "selected" } };
        const b = { ...a, id: "b", metadata: { content: "private unselected content" } };
        const result = normalizeAgentRunCanvasSnapshot({ nodes: [a, b], selectedNodeIds: ["a"], connections: [], layout: { nodes: [a, b], selectedNodeIds: ["a"], connections: [] } });
        expect(result.nodes.map((n) => n.id)).toEqual(["a"]);
        expect(result.layout?.nodes.map((n) => n.id)).toEqual(["a", "b"]);
        expect(JSON.stringify(canvasSnapshotPlannerView(result).layout)).not.toContain("content");
    });
});
