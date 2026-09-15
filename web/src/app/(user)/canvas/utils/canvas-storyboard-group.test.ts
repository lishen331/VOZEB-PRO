import { describe, expect, it } from "vitest";

import { CANVAS_GROUP_GRID } from "../constants";
import { CanvasNodeType, type CanvasNodeData } from "../types";
import { canvasGroupCandidates, canvasGroupCentroid, canvasGroupColumns, canvasGroupMemberSnapshot, canvasGroupRestoreLayout, canvasGroupRows, canvasGroupSize, isHiddenCanvasGroupMember } from "./canvas-storyboard-group";

function imageNode(id: string, position = { x: 0, y: 0 }, metadata: CanvasNodeData["metadata"] = {}): CanvasNodeData {
    return { id, type: CanvasNodeType.Image, title: id, position, width: 340, height: 240, metadata: { content: `/api/reference-assets/${id}.png`, ...metadata } };
}

function groupNode(id: string, memberIds: string[], position = { x: 0, y: 0 }): CanvasNodeData {
    const size = canvasGroupSize(memberIds.length);
    return { id, type: CanvasNodeType.Group, title: "分镜组", position, width: size.width, height: size.height, metadata: { groupMemberIds: memberIds } };
}

describe("canvasGroupColumns", () => {
    it("keeps 2 and 3 shots on a single row", () => {
        expect(canvasGroupColumns(2)).toBe(2);
        expect(canvasGroupColumns(3)).toBe(3);
    });

    it("caps at 3 columns for 4-6 shots so rows stay balanced", () => {
        expect(canvasGroupColumns(4)).toBe(3);
        expect(canvasGroupColumns(6)).toBe(3);
    });

    it("widens the grid for larger sequences", () => {
        expect(canvasGroupColumns(7)).toBe(4);
        expect(canvasGroupColumns(12)).toBe(4);
        expect(canvasGroupColumns(13)).toBe(5);
    });

    it("never returns zero columns or rows for an empty group", () => {
        expect(canvasGroupColumns(0)).toBe(1);
        expect(canvasGroupRows(0)).toBe(1);
    });
});

describe("canvasGroupSize", () => {
    it("never shrinks below the minimum card size", () => {
        const size = canvasGroupSize(2);

        expect(size.width).toBeGreaterThanOrEqual(CANVAS_GROUP_GRID.minWidth);
        expect(size.height).toBeGreaterThanOrEqual(CANVAS_GROUP_GRID.minHeight);
    });

    it("grows with row count", () => {
        expect(canvasGroupSize(9).height).toBeGreaterThan(canvasGroupSize(3).height);
    });
});

describe("canvasGroupCandidates", () => {
    it("accepts only image nodes that are not already grouped", () => {
        const nodes = [imageNode("a"), imageNode("b"), imageNode("c", { x: 0, y: 0 }, { groupId: "group-1" }), { ...imageNode("d"), type: CanvasNodeType.Text }];

        const candidates = canvasGroupCandidates(nodes, new Set(["a", "b", "c", "d"]));

        expect(candidates.map((node) => node.id)).toEqual(["a", "b"]);
    });

    it("includes panorama nodes because they are image content", () => {
        const nodes = [{ ...imageNode("pano"), type: CanvasNodeType.Panorama }];

        expect(canvasGroupCandidates(nodes, new Set(["pano"]))).toHaveLength(1);
    });

    it("ignores nodes outside the selection", () => {
        expect(canvasGroupCandidates([imageNode("a"), imageNode("b")], new Set(["a"]))).toHaveLength(1);
    });
});

describe("canvasGroupCentroid", () => {
    it("returns the average of the member centres", () => {
        const centroid = canvasGroupCentroid([imageNode("a", { x: 0, y: 0 }), imageNode("b", { x: 340, y: 240 })]);

        expect(centroid).toEqual({ x: 340, y: 240 });
    });

    it("returns the origin for an empty member list", () => {
        expect(canvasGroupCentroid([])).toEqual({ x: 0, y: 0 });
    });
});

describe("canvasGroupMemberSnapshot", () => {
    it("prefers content and carries natural dimensions", () => {
        const snapshot = canvasGroupMemberSnapshot(imageNode("a", { x: 0, y: 0 }, { content: "/a.png", naturalWidth: 1024, naturalHeight: 768 }));

        expect(snapshot).toEqual({ id: "a", content: "/a.png", width: 1024, height: 768 });
    });

    it("falls back to serverUrl when content is empty", () => {
        const snapshot = canvasGroupMemberSnapshot(imageNode("a", { x: 0, y: 0 }, { content: "", serverUrl: "/api/generation-log-assets/a.png" }));

        expect(snapshot.content).toBe("/api/generation-log-assets/a.png");
    });
});

describe("canvasGroupRestoreLayout", () => {
    it("lays members out below the group footprint", () => {
        const group = groupNode("group-1", ["a", "b"], { x: 100, y: 100 });

        const layout = canvasGroupRestoreLayout(group, ["a", "b"]);

        expect(layout.get("a")!.position).toEqual({ x: 100, y: 100 + group.height + CANVAS_GROUP_GRID.restoreGap });
        expect(layout.get("b")!.position.x).toBe(100 + CANVAS_GROUP_GRID.restoreWidth + CANVAS_GROUP_GRID.restoreGap);
        expect(layout.get("b")!.position.y).toBe(layout.get("a")!.position.y);
    });

    it("wraps onto a second row once the column count is exceeded", () => {
        const group = groupNode("group-1", ["a", "b", "c", "d"], { x: 0, y: 0 });

        const layout = canvasGroupRestoreLayout(group, ["a", "b", "c", "d"]);

        expect(layout.get("d")!.position.y).toBeGreaterThan(layout.get("a")!.position.y);
        expect(layout.get("d")!.position.x).toBe(0);
    });

    it("restores every member to the default image node size", () => {
        const layout = canvasGroupRestoreLayout(groupNode("group-1", ["a"]), ["a"]);

        expect(layout.get("a")).toMatchObject({ width: CANVAS_GROUP_GRID.restoreWidth, height: CANVAS_GROUP_GRID.restoreHeight });
    });
});

describe("isHiddenCanvasGroupMember", () => {
    it("hides a member while its group node exists", () => {
        const member = imageNode("a", { x: 0, y: 0 }, { groupId: "group-1" });
        const nodes = [member, groupNode("group-1", ["a"])];

        expect(isHiddenCanvasGroupMember(member, nodes)).toBe(true);
    });

    it("reveals a member whose group node was deleted", () => {
        const member = imageNode("a", { x: 0, y: 0 }, { groupId: "group-1" });

        expect(isHiddenCanvasGroupMember(member, [member])).toBe(false);
    });

    it("ignores nodes without a groupId", () => {
        const member = imageNode("a");

        expect(isHiddenCanvasGroupMember(member, [member, groupNode("group-1", [])])).toBe(false);
    });

    it("does not hide a member pointing at a non-group node", () => {
        const member = imageNode("a", { x: 0, y: 0 }, { groupId: "image-b" });
        const nodes = [member, imageNode("image-b")];

        expect(isHiddenCanvasGroupMember(member, nodes)).toBe(false);
    });
});
