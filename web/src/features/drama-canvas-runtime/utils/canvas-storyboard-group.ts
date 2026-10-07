import { CANVAS_GROUP_GRID } from "../constants";
import { CanvasNodeType, isCanvasImageNodeType, type CanvasGroupMemberSnapshot, type CanvasNodeData, type Position } from "../types";

export const CANVAS_GROUP_MIN_MEMBERS = 2;

/**
 * Grid columns for a storyboard group. Explicit breakpoints rather than
 * `ceil(sqrt(n))` so 2 and 3 images stay on one row — a 3-shot sequence reads as
 * a strip, not as a 2x2 with a hole in it.
 */
export function canvasGroupColumns(count: number) {
    if (count <= 1) return 1;
    if (count <= 3) return count;
    if (count <= 6) return 3;
    if (count <= 12) return 4;
    return 5;
}

export function canvasGroupRows(count: number) {
    return Math.max(1, Math.ceil(count / canvasGroupColumns(count)));
}

export function canvasGroupSize(count: number) {
    const cols = canvasGroupColumns(count);
    const rows = canvasGroupRows(count);
    const { cellWidth, cellHeight, gap, padding, headerHeight, minWidth, minHeight } = CANVAS_GROUP_GRID;
    return {
        width: Math.max(minWidth, padding * 2 + cols * cellWidth + (cols - 1) * gap),
        height: Math.max(minHeight, headerHeight + padding * 2 + rows * cellHeight + (rows - 1) * gap),
    };
}

export function canvasGroupCandidates(nodes: CanvasNodeData[], selectedNodeIds: Set<string>) {
    return nodes.filter((node) => selectedNodeIds.has(node.id) && isCanvasImageNodeType(node.type) && !node.metadata?.groupId);
}

export function canvasGroupMemberSnapshot(node: CanvasNodeData): CanvasGroupMemberSnapshot {
    return {
        id: node.id,
        content: node.metadata?.content || node.metadata?.serverUrl || "",
        width: node.metadata?.naturalWidth || node.width,
        height: node.metadata?.naturalHeight || node.height,
    };
}

/** Centroid of the member bounding boxes, so the group lands where the images were. */
export function canvasGroupCentroid(members: CanvasNodeData[]): Position {
    if (!members.length) return { x: 0, y: 0 };
    const sum = members.reduce((acc, node) => ({ x: acc.x + node.position.x + node.width / 2, y: acc.y + node.position.y + node.height / 2 }), { x: 0, y: 0 });
    return { x: sum.x / members.length, y: sum.y / members.length };
}

/**
 * Where each member lands when a group dissolves. Laid out below the group's own
 * footprint so restored nodes never spawn underneath the card they came from.
 */
export function canvasGroupRestoreLayout(group: CanvasNodeData, memberIds: string[]) {
    const cols = canvasGroupColumns(memberIds.length);
    const { restoreWidth, restoreHeight, restoreGap } = CANVAS_GROUP_GRID;
    const originY = group.position.y + group.height + restoreGap;
    return new Map(
        memberIds.map((id, index) => [
            id,
            {
                position: {
                    x: group.position.x + (index % cols) * (restoreWidth + restoreGap),
                    y: originY + Math.floor(index / cols) * (restoreHeight + restoreGap),
                },
                width: restoreWidth,
                height: restoreHeight,
            },
        ]),
    );
}

export function isCanvasGroupNode(node: CanvasNodeData | null | undefined) {
    return node?.type === CanvasNodeType.Group;
}

/** A member is hidden while its owning Group node still exists on the canvas. */
export function isHiddenCanvasGroupMember(node: CanvasNodeData, nodes: CanvasNodeData[] | Map<string, CanvasNodeData>) {
    const groupId = node.metadata?.groupId;
    if (!groupId) return false;
    const group = Array.isArray(nodes) ? nodes.find((item) => item.id === groupId) : nodes.get(groupId);
    return group?.type === CanvasNodeType.Group;
}
