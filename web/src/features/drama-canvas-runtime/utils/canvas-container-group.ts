import { CANVAS_CONTAINER } from "../constants";
import { CanvasNodeType, isCanvasImageNodeType, type CanvasGenerationMode, type CanvasNodeData, type Position } from "../types";
import { isHiddenCanvasGroupMember } from "./canvas-storyboard-group";

/** Minimum nodes a box-selection must cover before it can become a 生成组. */
export const CANVAS_CONTAINER_MIN_MEMBERS = 1;

/**
 * Node types 整组执行 can trigger. Frames and pure inputs are not generation
 * targets: a Container is a frame, Group/Brief/Task/BrandKit have no generate
 * path, and Config drives a sibling rather than producing its own output.
 */
const GENERATABLE_TYPES = new Set<CanvasNodeType>([CanvasNodeType.Image, CanvasNodeType.Panorama, CanvasNodeType.Video, CanvasNodeType.Audio, CanvasNodeType.Text]);

export function isCanvasGeneratableNode(node: CanvasNodeData) {
    if (!GENERATABLE_TYPES.has(node.type)) return false;
    // Needs something to generate from — its own prompt, or upstream references
    // resolved at run time. An empty node would just fail the request.
    return Boolean(node.metadata?.prompt?.trim() || node.metadata?.composerContent?.trim());
}

/**
 * Members of `containerId` that 整组执行 should fire, in canvas order. Skips
 * nodes already running so a second click cannot double-submit the same node.
 */
/**
 * Generation mode a node runs in. Mirrors the per-type mapping the prompt panel
 * uses, so a member fired by 整组执行 takes exactly the path a solo click takes.
 */
export function canvasNodeGenerationMode(node: CanvasNodeData): CanvasGenerationMode {
    if (node.metadata?.generationMode) return node.metadata.generationMode;
    if (node.type === CanvasNodeType.Video) return "video";
    if (node.type === CanvasNodeType.Audio) return "audio";
    if (node.type === CanvasNodeType.Text) return "text";
    return "image";
}

export function canvasContainerGeneratableIds(containerId: string, nodes: CanvasNodeData[]) {
    return nodes.filter((node) => node.metadata?.containerId === containerId && node.metadata?.status !== "loading" && isCanvasGeneratableNode(node)).map((node) => node.id);
}

export function isCanvasContainerNode(node: CanvasNodeData | null | undefined) {
    return node?.type === CanvasNodeType.Container;
}

/**
 * Members of a container, resolved from each node's own `containerId` rather
 * than the container's `containerChildIds` list. Same lesson as dissolveGroup:
 * the id list can hold ids of nodes that were since deleted, while the back
 * pointer can only exist on a node that is still here.
 */
export function canvasContainerChildIds(containerId: string, nodes: CanvasNodeData[]) {
    return nodes.filter((node) => node.metadata?.containerId === containerId).map((node) => node.id);
}

/**
 * Frame that encloses `members`, with room for the header strip on top.
 * Returned in the same shape as a node so callers can spread it directly.
 */
export function canvasContainerFrame(members: CanvasNodeData[]) {
    if (!members.length) {
        return { position: { x: 0, y: 0 }, width: CANVAS_CONTAINER.minWidth, height: CANVAS_CONTAINER.minHeight };
    }
    const left = Math.min(...members.map((node) => node.position.x));
    const top = Math.min(...members.map((node) => node.position.y));
    const right = Math.max(...members.map((node) => node.position.x + node.width));
    const bottom = Math.max(...members.map((node) => node.position.y + node.height));
    const { padding, headerHeight, minWidth, minHeight } = CANVAS_CONTAINER;
    return {
        position: { x: left - padding, y: top - padding - headerHeight },
        width: Math.max(right - left + padding * 2, minWidth),
        height: Math.max(bottom - top + padding * 2 + headerHeight, minHeight),
    };
}

/**
 * Nodes a container may claim. Excludes itself, nodes already owned by another
 * container, storyboard-group members (they are hidden, so capturing them would
 * put invisible nodes in a visible frame) and batch children (they follow their
 * root, not a frame).
 */
export function canvasContainerCapture(container: CanvasNodeData, nodes: CanvasNodeData[]) {
    return nodes.filter((node) => {
        if (node.id === container.id) return false;
        const ownerId = node.metadata?.containerId;
        if (ownerId && ownerId !== container.id) return false;
        if (node.metadata?.batchRootId) return false;
        if (isHiddenCanvasGroupMember(node, nodes)) return false;
        return isInsideCanvasContainer(node, container);
    });
}

/**
 * Ids to move when `selectedIds` are dragged: every selection plus, transitively,
 * the descendants of any container in it. The `seen` set is what keeps a
 * malformed cycle (A contains B contains A, possible after a bad import) from
 * hanging the drag loop.
 */
export function expandCanvasContainerDescendants(nodes: CanvasNodeData[], selectedIds: Iterable<string>) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const result = new Set(selectedIds);
    const queue = [...result];
    const seen = new Set<string>();
    while (queue.length) {
        const id = queue.shift()!;
        if (seen.has(id)) continue;
        seen.add(id);
        if (!isCanvasContainerNode(byId.get(id))) continue;
        for (const childId of canvasContainerChildIds(id, nodes)) {
            if (result.has(childId)) continue;
            result.add(childId);
            queue.push(childId);
        }
    }
    return result;
}

/**
 * Nodes that each get their own wire when one is dragged out of a 生成组: every
 * member, nested frames flattened, frames themselves skipped. `excludeId` drops
 * the drop target so a member can't end up wired to itself.
 */
export function canvasContainerWireSourceIds(containerId: string, nodes: CanvasNodeData[], excludeId?: string) {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return [...expandCanvasContainerDescendants(nodes, [containerId])].filter((id) => id !== excludeId && byId.has(id) && !isCanvasContainerNode(byId.get(id)));
}

/** Frame tints offered by the 生成组 toolbar. `null` is the theme's own border. */
export const CANVAS_CONTAINER_COLORS = ["#94a3b8", "#3b82f6", "#22c55e", "#eab308", "#f97316", "#ef4444", "#a855f7"] as const;

export type CanvasContainerArrangement = "grid" | "row" | "column";

const CANVAS_CONTAINER_ARRANGE_GAP = 32;

/**
 * Re-lays out a container's direct members inside its current top-left corner
 * and returns the new frame plus a move delta per moved node. Nested frames move
 * as a block: the delta is applied to every descendant so their contents follow.
 */
export function arrangeCanvasContainer(containerId: string, nodes: CanvasNodeData[], arrangement: CanvasContainerArrangement) {
    const container = nodes.find((node) => node.id === containerId);
    const members = nodes.filter((node) => node.metadata?.containerId === containerId).sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
    if (!container || !members.length) return null;

    const { padding, headerHeight } = CANVAS_CONTAINER;
    const originX = container.position.x + padding;
    const originY = container.position.y + padding + headerHeight;
    const columns = arrangement === "row" ? members.length : arrangement === "column" ? 1 : Math.ceil(Math.sqrt(members.length));
    const columnWidths = Array.from({ length: columns }, (_, column) => Math.max(...members.filter((_, index) => index % columns === column).map((node) => node.width)));
    const rowCount = Math.ceil(members.length / columns);
    const rowHeights = Array.from({ length: rowCount }, (_, row) => Math.max(...members.slice(row * columns, row * columns + columns).map((node) => node.height)));

    const deltas = new Map<string, Position>();
    const arranged = members.map((node, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const x = originX + columnWidths.slice(0, column).reduce((sum, width) => sum + width + CANVAS_CONTAINER_ARRANGE_GAP, 0);
        const y = originY + rowHeights.slice(0, row).reduce((sum, height) => sum + height + CANVAS_CONTAINER_ARRANGE_GAP, 0);
        const delta = { x: x - node.position.x, y: y - node.position.y };
        expandCanvasContainerDescendants(nodes, [node.id]).forEach((id) => deltas.set(id, delta));
        return { ...node, position: { x, y } };
    });

    const frame = canvasContainerFrame(arranged);
    return { frame: { ...frame, position: container.position }, deltas };
}

/** Image and video members with content, nested frames included, for 下载. */
export function canvasContainerMediaNodes(containerId: string, nodes: CanvasNodeData[]) {
    const ids = expandCanvasContainerDescendants(nodes, [containerId]);
    return nodes.filter((node) => ids.has(node.id) && node.id !== containerId && Boolean(node.metadata?.content) && (isCanvasImageNodeType(node.type) || node.type === CanvasNodeType.Video));
}

/** True when `node` lies fully inside the container's frame. */
export function isInsideCanvasContainer(node: CanvasNodeData, container: CanvasNodeData) {
    return node.position.x >= container.position.x && node.position.y >= container.position.y && node.position.x + node.width <= container.position.x + container.width && node.position.y + node.height <= container.position.y + container.height;
}
