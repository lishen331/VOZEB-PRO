import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasNodeData } from "../types";
import { canvasContainerCapture, canvasContainerFrame, canvasContainerGeneratableIds, expandCanvasContainerDescendants, isCanvasGeneratableNode } from "./canvas-container-group";

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
