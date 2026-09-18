import { CanvasNodeType, type CanvasNodeData, type Position, type ViewportTransform } from "../types";

const HANDLE_CLEARANCE = 32;
const FORWARD_GAP = HANDLE_CLEARANCE * 2;

export function worldFromScreen(clientX: number, clientY: number, viewport: ViewportTransform, rect: Pick<DOMRect, "left" | "top">): Position {
    return { x: (clientX - rect.left - viewport.x) / viewport.k, y: (clientY - rect.top - viewport.y) / viewport.k };
}

/** The edge hit path lives inside the scaled world layer, so its stroke must be divided by the zoom to stay clickable when zoomed out. */
export function canvasEdgeHitStrokeWidth(zoom: number, screenWidth = 18) {
    if (!Number.isFinite(zoom) || zoom <= 0) return screenWidth;
    return screenWidth / zoom;
}

export function isCanvasVideoControlPoint(rect: Pick<DOMRect, "bottom" | "height">, clientY: number) {
    const controlsHeight = Math.max(40, Math.min(72, rect.height * 0.22));
    return clientY >= rect.bottom - controlsHeight;
}

export function nodeAnchor(node: CanvasNodeData, handleType: "source" | "target"): Position {
    return { x: handleType === "source" ? node.position.x + node.width : node.position.x, y: node.position.y + node.height / 2 };
}

export function edgePath(from: CanvasNodeData, to: CanvasNodeData) {
    const start = nodeAnchor(from, "source");
    const end = nodeAnchor(to, "target");
    const forwardDistance = end.x - start.x;
    if (forwardDistance >= FORWARD_GAP) return forwardCurve(start, end, 1, forwardDistance).path;
    return smoothCurve(start, end);
}

export function previewPath(start: Position, end: Position, handleType: "source" | "target") {
    const direction = handleType === "source" ? 1 : -1;
    const forwardDistance = (end.x - start.x) * direction;
    if (forwardDistance >= FORWARD_GAP) return forwardCurve(start, end, direction, forwardDistance).path;
    return smoothCurve(start, end);
}

export function samePosition(a: Position, b: Position) {
    return Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01;
}

export function selectNodesInBounds(nodes: CanvasNodeData[], start: Position, end: Position, initialNodeIds: Iterable<string> = []) {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minY = Math.min(start.y, end.y);
    const maxY = Math.max(start.y, end.y);
    const selected = new Set(initialNodeIds);
    for (const node of nodes) {
        if (node.position.x < maxX && node.position.x + node.width > minX && node.position.y < maxY && node.position.y + node.height > minY) selected.add(node.id);
    }
    return selected;
}

export function expandCanvasDragNodeIds(nodes: CanvasNodeData[], selectedNodeIds: Iterable<string>) {
    const dragNodeIds = new Set(selectedNodeIds);
    for (const node of nodes) {
        if (!dragNodeIds.has(node.id)) continue;
        node.metadata?.batchChildIds?.forEach((childId) => dragNodeIds.add(childId));
    }
    return [...dragNodeIds];
}

/**
 * Fraction of each half-extent that still counts as aiming at a node.
 * Previously ANY point inside the bounds snapped, so a card the pointer merely
 * crossed stole the connection while the cursor was still far from it.
 */
export const CONNECTION_SNAP_CORE = 0.55;

/** True when `world` is inside the node's shrunken central snap zone. */
export function isNearNodeCenter(world: Position, node: CanvasNodeData) {
    const halfWidth = (node.width / 2) * CONNECTION_SNAP_CORE;
    const halfHeight = (node.height / 2) * CONNECTION_SNAP_CORE;
    const centerX = node.position.x + node.width / 2;
    const centerY = node.position.y + node.height / 2;
    return Math.abs(world.x - centerX) <= halfWidth && Math.abs(world.y - centerY) <= halfHeight;
}

export function findConnectionTarget(world: Position, draft: { nodeId: string; handleType: "source" | "target" }, nodes: CanvasNodeData[], scale: number) {
    const tolerance = 52 / Math.max(scale, 0.1);
    let best: { id: string; distance: number } | null = null;
    for (let index = nodes.length - 1; index >= 0; index -= 1) {
        const node = nodes[index];
        if (node.id === draft.nodeId || (draft.handleType === "target" && node.type === CanvasNodeType.Config)) continue;
        const anchor = nodeAnchor(node, draft.handleType === "source" ? "target" : "source");
        const nearCenter = isNearNodeCenter(world, node);
        const distance = Math.hypot(world.x - anchor.x, world.y - anchor.y);
        if (!nearCenter && distance > tolerance) continue;
        if (!best || distance < best.distance) best = { id: node.id, distance };
    }
    return best?.id || null;
}

export function isBlockedConnectionDrop(world: Position, draft: { nodeId: string; handleType: "source" | "target" }, nodes: CanvasNodeData[], scale: number) {
    const tolerance = 52 / Math.max(scale, 0.1);
    return nodes.some((node) => {
        const blocked = node.id === draft.nodeId || (draft.handleType === "target" && node.type === CanvasNodeType.Config);
        if (!blocked) return false;
        const anchor = nodeAnchor(node, draft.handleType === "source" ? "target" : "source");
        const inside = world.x >= node.position.x && world.x <= node.position.x + node.width && world.y >= node.position.y && world.y <= node.position.y + node.height;
        return inside || Math.hypot(world.x - anchor.x, world.y - anchor.y) <= tolerance;
    });
}

function forwardCurve(start: Position, end: Position, direction: 1 | -1, forwardDistance: number) {
    const curvature = Math.min(Math.max(forwardDistance * 0.5, 50), 240);
    const controlStart = { x: start.x + direction * curvature, y: start.y };
    const controlEnd = { x: end.x - direction * curvature, y: end.y };
    return { path: `M ${format(start.x)} ${format(start.y)} C ${format(controlStart.x)} ${format(controlStart.y)}, ${format(controlEnd.x)} ${format(controlEnd.y)}, ${format(end.x)} ${format(end.y)}`, start, controlStart, controlEnd, end };
}

function smoothCurve(start: Position, end: Position) {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const curvature = Math.min(Math.max(Math.max(Math.abs(dx), Math.abs(dy)) * 0.5, 60), 260);
    const controlStart = { x: start.x + curvature, y: start.y };
    const controlEnd = { x: end.x - curvature, y: end.y };
    return `M ${format(start.x)} ${format(start.y)} C ${format(controlStart.x)} ${format(controlStart.y)}, ${format(controlEnd.x)} ${format(controlEnd.y)}, ${format(end.x)} ${format(end.y)}`;
}

function format(value: number) {
    return Number(value.toFixed(2));
}
