import { CANVAS_CONTAINER } from "../constants";
import { CanvasNodeType, type CanvasGenerationMode, type CanvasNodeData } from "../types";
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

/** True when `node` lies fully inside the container's frame. */
export function isInsideCanvasContainer(node: CanvasNodeData, container: CanvasNodeData) {
    return node.position.x >= container.position.x && node.position.y >= container.position.y && node.position.x + node.width <= container.position.x + container.width && node.position.y + node.height <= container.position.y + container.height;
}
