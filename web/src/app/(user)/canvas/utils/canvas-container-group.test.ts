import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { arrangeCanvasContainer, canvasContainerCapture, canvasContainerFrame, canvasContainerGeneratableIds, canvasContainerMediaNodes, expandCanvasContainerDescendants, isCanvasGeneratableNode } from "./canvas-container-group";

function node(id: string, type: CanvasNodeType, x: number, y: number, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return { id, type, title: id, position: { x, y }, width: 100, height: 100, metadata };
}

function container(id: string, x: number, y: number, width = 600, height = 600): CanvasNodeData {
    return { id, type: CanvasNodeType.Container, title: id, position: { x, y }, width, height, metadata: {} };
}

describe("canvas container group", () => {
    it("frames members with padding and header room above the topmost member", () => {
        const frame = canvasContainerFrame([node("a", CanvasNodeType.Image, 200, 200), node("b", CanvasNodeType.Image, 400, 500)]);
        expect(frame.position.x).toBeLessThan(200);
        expect(frame.position.y).toBeLessThan(200 - 24);
        expect(frame.width).toBeGreaterThanOrEqual(300);
        expect(frame.height).toBeGreaterThanOrEqual(400);
    });

    it("captures nodes inside the frame but never itself, foreign members, or hidden nodes", () => {
        const frame = container("frame", 0, 0);
        const inside = node("inside", CanvasNodeType.Image, 100, 100);
        const outside = node("outside", CanvasNodeType.Image, 900, 900);
        const foreign = node("foreign", CanvasNodeType.Image, 150, 150, { containerId: "other-frame" });
        const batchChild = node("batch", CanvasNodeType.Image, 200, 200, { batchRootId: "root" });
        const storyboard = node("shot", CanvasNodeType.Image, 250, 250, { groupId: "sb" });
        const sbGroup = node("sb", CanvasNodeType.Group, 800, 800);
        const nodes = [frame, inside, outside, foreign, batchChild, storyboard, sbGroup];

        expect(canvasContainerCapture(frame, nodes).map((item) => item.id)).toEqual(["inside"]);
    });

    it("re-captures a node it already owns so resizing keeps membership stable", () => {
        const frame = container("frame", 0, 0);
        const own = node("own", CanvasNodeType.Image, 100, 100, { containerId: "frame" });
        expect(canvasContainerCapture(frame, [frame, own]).map((item) => item.id)).toEqual(["own"]);
    });

    it("expands nested container descendants transitively", () => {
        const outer = container("outer", 0, 0);
        const inner = { ...container("inner", 50, 50, 300, 300), metadata: { containerId: "outer" } };
        const leaf = node("leaf", CanvasNodeType.Image, 100, 100, { containerId: "inner" });
        const unrelated = node("unrelated", CanvasNodeType.Image, 900, 900);

        expect(expandCanvasContainerDescendants([outer, inner, leaf, unrelated], ["outer"])).toEqual(new Set(["outer", "inner", "leaf"]));
    });

    it("survives a containment cycle instead of hanging", () => {
        const a = { ...container("a", 0, 0), metadata: { containerId: "b" } };
        const b = { ...container("b", 0, 0), metadata: { containerId: "a" } };
        expect(expandCanvasContainerDescendants([a, b], ["a"])).toEqual(new Set(["a", "b"]));
    });

    it("counts only prompted generatable nodes as execution targets", () => {
        expect(isCanvasGeneratableNode(node("x", CanvasNodeType.Image, 0, 0, { prompt: "a cat" }))).toBe(true);
        expect(isCanvasGeneratableNode(node("x", CanvasNodeType.Image, 0, 0))).toBe(false);
        expect(isCanvasGeneratableNode(node("x", CanvasNodeType.Container, 0, 0, { prompt: "a cat" }))).toBe(false);
        expect(isCanvasGeneratableNode(node("x", CanvasNodeType.Group, 0, 0, { prompt: "a cat" }))).toBe(false);
    });

    it("arranges members in a row without overlap and refits the frame around them", () => {
        const frame = container("frame", 0, 0, 900, 900);
        const nodes = [frame, node("a", CanvasNodeType.Image, 400, 500, { containerId: "frame" }), node("b", CanvasNodeType.Image, 100, 100, { containerId: "frame" }), node("c", CanvasNodeType.Image, 300, 300, { containerId: "frame" })];

        const result = arrangeCanvasContainer("frame", nodes, "row")!;
        const moved = nodes.slice(1).map((item) => ({ ...item, position: { x: item.position.x + result.deltas.get(item.id)!.x, y: item.position.y + result.deltas.get(item.id)!.y } }));
        const byX = [...moved].sort((left, right) => left.position.x - right.position.x);

        expect(byX.map((item) => item.id)).toEqual(["b", "c", "a"]);
        expect(new Set(moved.map((item) => item.position.y)).size).toBe(1);
        byX.slice(1).forEach((item, index) => expect(item.position.x).toBeGreaterThanOrEqual(byX[index].position.x + byX[index].width));
        expect(result.frame.position).toEqual(frame.position);
        moved.forEach((item) => expect(item.position.x + item.width).toBeLessThanOrEqual(result.frame.position.x + result.frame.width));
    });

    it("moves a nested frame's contents with it when arranging", () => {
        const outer = container("outer", 0, 0, 1200, 1200);
        const inner = { ...container("inner", 500, 500, 300, 300), metadata: { containerId: "outer" } };
        const leaf = node("leaf", CanvasNodeType.Image, 550, 550, { containerId: "inner" });

        const result = arrangeCanvasContainer("outer", [outer, inner, leaf], "column")!;

        expect(result.deltas.get("leaf")).toEqual(result.deltas.get("inner"));
    });

    it("collects image and video members with content for download, nested frames included", () => {
        const outer = container("outer", 0, 0);
        const inner = { ...container("inner", 0, 0), metadata: { containerId: "outer" } };
        const nodes = [
            outer,
            inner,
            node("img", CanvasNodeType.Image, 0, 0, { containerId: "outer", content: "/a.png" }),
            node("vid", CanvasNodeType.Video, 0, 0, { containerId: "inner", content: "/b.mp4" }),
            node("empty", CanvasNodeType.Image, 0, 0, { containerId: "outer" }),
            node("text", CanvasNodeType.Text, 0, 0, { containerId: "outer", content: "hi" }),
            node("outside", CanvasNodeType.Image, 0, 0, { content: "/c.png" }),
        ];

        expect(canvasContainerMediaNodes("outer", nodes).map((item) => item.id)).toEqual(["img", "vid"]);
    });

    it("skips already-running members so a second click cannot double-submit", () => {
        const nodes = [
            node("ready", CanvasNodeType.Image, 0, 0, { containerId: "frame", prompt: "a" }),
            node("running", CanvasNodeType.Image, 0, 0, { containerId: "frame", prompt: "b", status: "loading" }),
            node("blank", CanvasNodeType.Image, 0, 0, { containerId: "frame" }),
            node("elsewhere", CanvasNodeType.Image, 0, 0, { containerId: "other", prompt: "c" }),
        ];
        expect(canvasContainerGeneratableIds("frame", nodes)).toEqual(["ready"]);
    });
});
