import { imageReferenceLabel } from "@/lib/image-reference-prompt";
import { seedanceReferenceLabel } from "@/lib/seedance-video";
import { CanvasNodeType, isCanvasImageNodeType, type CanvasConnection, type CanvasNodeData } from "../types";
import { expandCanvasContainerDescendants } from "./canvas-container-group";

type CanvasResourceKind = "image" | "video" | "audio" | "text";

export type CanvasResourceReference = {
    id: string;
    nodeId: string;
    kind: CanvasResourceKind;
    label: string;
    title: string;
    previewUrl?: string;
    storageKey?: string;
    remoteUrl?: string;
    serverUrl?: string;
    mimeType?: string;
    width?: number;
    height?: number;
    bytes?: number;
    durationMs?: number;
    text?: string;
    active: boolean;
};

export function buildCanvasResourceReferences(nodes: CanvasNodeData[], connections: CanvasConnection[], contextNodeId?: string | null) {
    return createCanvasResourceReferenceIndex(nodes, connections).all(contextNodeId);
}

export function buildNodeMentionReferences(node: CanvasNodeData, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    return createCanvasResourceReferenceIndex(nodes, connections).forNode(node.id);
}

export function getGenerationResourceNodes(nodeId: string, nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    return createCanvasResourceReferenceIndex(nodes, connections).resourceNodesFor(nodeId, false);
}

/**
 * Resource nodes a single connection contributes, as seen from its target.
 *
 * A 生成组 is a frame, not a resource itself: one wire drawn out of the frame
 * stands in for every resource member inside it, so the user connects a group
 * once instead of chasing each member. Nested frames expand transitively and
 * the frame itself is never its own input.
 *
 * A storyboard Group keeps its own path: its members are hidden and redrawn as
 * a snapshot grid, but the nodes are still present, so the same expansion works.
 */
function canvasConnectionSourceResourceNodes(source: CanvasNodeData, nodes: CanvasNodeData[], nodeById: Map<string, CanvasNodeData>) {
    if (source.type === CanvasNodeType.Container) {
        return [...expandCanvasContainerDescendants(nodes, [source.id])]
            .filter((id) => id !== source.id)
            .map((id) => nodeById.get(id))
            .filter((node): node is CanvasNodeData => Boolean(node) && isResourceNode(node!));
    }
    if (source.type === CanvasNodeType.Group) {
        return (source.metadata?.groupMemberIds || []).map((id) => nodeById.get(id)).filter((node): node is CanvasNodeData => Boolean(node) && isResourceNode(node!));
    }
    return isResourceNode(source) ? [source] : [];
}

export function createCanvasResourceReferenceIndex(nodes: CanvasNodeData[], connections: CanvasConnection[]) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const inputsByTargetId = new Map<string, CanvasNodeData[]>();
    const connectedConfigBySourceId = new Map<string, string>();
    for (const connection of connections) {
        const source = nodeById.get(connection.fromNodeId);
        const target = nodeById.get(connection.toNodeId);
        if (!source || !target) continue;
        const sourceResourceNodes = canvasConnectionSourceResourceNodes(source, nodes, nodeById);
        if (sourceResourceNodes.length) {
            const inputs = inputsByTargetId.get(target.id);
            if (inputs) inputs.push(...sourceResourceNodes);
            else inputsByTargetId.set(target.id, [...sourceResourceNodes]);
        }
        if (target.type === CanvasNodeType.Config && !connectedConfigBySourceId.has(source.id)) connectedConfigBySourceId.set(source.id, target.id);
    }

    const globalReferences = labelResourceNodes(nodes.filter(isResourceNode), false);
    const resourceNodesCache = new Map<string, CanvasNodeData[]>();
    const referencesCache = new Map<string, CanvasResourceReference[]>();
    const resourceNodesFor = (nodeId: string, includeSelf = true) => {
        const cacheKey = `${includeSelf ? "self" : "inputs"}:${nodeId}`;
        const cached = resourceNodesCache.get(cacheKey);
        if (cached) return cached;
        const configId = connectedConfigBySourceId.get(nodeId);
        const configInputs = configId ? (inputsByTargetId.get(configId) || []).filter((node) => node.id !== nodeId) : [];
        const ownInputs = inputsByTargetId.get(nodeId) || [];
        const ownNode = nodeById.get(nodeId);
        const result = configInputs.length ? configInputs : ownInputs.length ? ownInputs : includeSelf && ownNode && isResourceNode(ownNode) ? [ownNode] : [];
        resourceNodesCache.set(cacheKey, result);
        return result;
    };
    const forNode = (nodeId: string) => {
        const cached = referencesCache.get(nodeId);
        if (cached) return cached;
        const references = labelResourceNodes(resourceNodesFor(nodeId), true);
        referencesCache.set(nodeId, references);
        return references;
    };
    return {
        resourceNodesFor,
        forNode,
        all(contextNodeId?: string | null) {
            if (!contextNodeId) return globalReferences;
            const activeByNodeId = new Map(forNode(contextNodeId).map((reference) => [reference.nodeId, reference]));
            return globalReferences.map((reference) => activeByNodeId.get(reference.nodeId) || reference);
        },
    };
}

export type CanvasResourceReferenceIndex = ReturnType<typeof createCanvasResourceReferenceIndex>;

function labelResourceNodes(nodes: CanvasNodeData[], active: boolean) {
    const counts: Record<CanvasResourceKind, number> = { image: 0, video: 0, audio: 0, text: 0 };
    return nodes.flatMap((node): CanvasResourceReference[] => {
        const kind = resourceKind(node);
        if (!kind) return [];
        const index = counts[kind]++;
        const label = labelForKind(kind, index);
        return [
            {
                id: node.id,
                nodeId: node.id,
                kind,
                label,
                title: node.title || label,
                previewUrl: node.metadata?.content,
                storageKey: node.metadata?.storageKey,
                remoteUrl: node.metadata?.remoteUrl,
                serverUrl: node.metadata?.serverUrl,
                mimeType: node.metadata?.mimeType,
                width: node.metadata?.naturalWidth || node.width,
                height: node.metadata?.naturalHeight || node.height,
                bytes: node.metadata?.bytes,
                durationMs: node.metadata?.durationMs,
                text: node.type === CanvasNodeType.Text ? node.metadata?.content || node.metadata?.prompt : undefined,
                active,
            },
        ];
    });
}

function labelForKind(kind: CanvasResourceKind, index: number) {
    if (kind === "image") return imageReferenceLabel(index);
    if (kind === "video") return seedanceReferenceLabel("video", index);
    if (kind === "audio") return seedanceReferenceLabel("audio", index);
    return `文本${index + 1}`;
}

function isResourceNode(node: CanvasNodeData) {
    return Boolean(resourceKind(node));
}

function resourceKind(node: CanvasNodeData): CanvasResourceKind | null {
    if (isCanvasImageNodeType(node.type)) return "image";
    if (node.type === CanvasNodeType.Video) return "video";
    if (node.type === CanvasNodeType.Audio) return "audio";
    if (node.type === CanvasNodeType.Text) return "text";
    return null;
}
