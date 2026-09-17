import { describe, expect, it } from "vitest";

import { CanvasNodeType, type CanvasConnection, type CanvasNodeData } from "../types";
import { createCanvasResourceReferenceIndex } from "./canvas-resource-references";

describe("canvas resource reference index", () => {
    it("keeps every image reference available on canvases larger than fifty images", () => {
        const images = Array.from({ length: 64 }, (_, index) => imageNode(`image-${index + 1}`));
        const index = createCanvasResourceReferenceIndex(images, []);

        expect(index.all()).toHaveLength(images.length);
        expect(index.all().at(-1)).toMatchObject({ nodeId: "image-64", label: "图片64", active: false });
        expect(index.forNode("image-64")).toEqual([expect.objectContaining({ nodeId: "image-64", label: "图片1", active: true })]);
        expect(index.forNode("image-64")).toBe(index.forNode("image-64"));
    });

    it("expands a connected group into its member images so downstream nodes can reference them", () => {
        const members = [imageNode("m1"), imageNode("m2")];
        const group = node("group", CanvasNodeType.Group, { groupMemberIds: ["m1", "m2"] });
        const downstream = node("shot", CanvasNodeType.Config);
        const grouped = members.map((member) => ({ ...member, metadata: { ...member.metadata, groupId: "group" } }));
        const connections: CanvasConnection[] = [{ id: "group-shot", fromNodeId: "group", toNodeId: "shot" }];
        const index = createCanvasResourceReferenceIndex([...grouped, group, downstream], connections);

        expect(index.resourceNodesFor("shot", false).map((item) => item.id)).toEqual(["m1", "m2"]);
        expect(index.forNode("shot").map((reference) => reference.nodeId)).toEqual(["m1", "m2"]);
    });

    it("reuses the indexed connection graph for config and direct node inputs", () => {
        const images = [imageNode("one"), imageNode("two")];
        const config = node("config", CanvasNodeType.Config);
        const connections: CanvasConnection[] = [
            { id: "one-config", fromNodeId: "one", toNodeId: "config" },
            { id: "two-config", fromNodeId: "two", toNodeId: "config" },
        ];
        const index = createCanvasResourceReferenceIndex([...images, config], connections);

        expect(index.forNode("config").map((reference) => reference.nodeId)).toEqual(["one", "two"]);
        expect(index.forNode("one").map((reference) => reference.nodeId)).toEqual(["two"]);
        expect(index.resourceNodesFor("one", false).map((item) => item.id)).toEqual(["two"]);
    });
});

function imageNode(id: string) {
    return node(id, CanvasNodeType.Image, { content: `/api/reference-assets/${id}.png` });
}

function node(id: string, type: CanvasNodeType, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return { id, type, title: id, position: { x: 0, y: 0 }, width: 320, height: 180, metadata };
}
