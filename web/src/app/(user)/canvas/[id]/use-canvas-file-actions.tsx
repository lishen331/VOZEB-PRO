"use client";

import { nanoid } from "nanoid";
import { useCallback, useEffect } from "react";

import { clipboardImageFiles } from "@/lib/clipboard-image-files";
import { uploadMediaFile } from "@/services/file-storage";
import { NODE_DEFAULT_SIZE } from "../constants";
import { CanvasNodeType, type CanvasNodeData, type Position } from "../types";
import { fitNodeSize } from "../utils/canvas-node-size";

import { CANVAS_DROP_NODE_OFFSET, NODE_STATUS_SUCCESS, VIDEO_NODE_MAX_HEIGHT, VIDEO_NODE_MAX_WIDTH, createCanvasNode } from "./canvas-page-elements";
import { audioMetadata, imageMetadata, uploadCanvasImage, videoMetadata } from "./canvas-page-utils";
import { CANVAS_GROUP_MIN_MEMBERS, canvasGroupCandidates, canvasGroupCentroid, canvasGroupMemberSnapshot, canvasGroupRestoreLayout, canvasGroupSize } from "../utils/canvas-storyboard-group";

import type { CanvasInteractions } from "./use-canvas-interactions";
import type { CanvasPageState } from "./use-canvas-page-state";

export function useCanvasFileActions({ state, interactions }: { state: CanvasPageState; interactions: CanvasInteractions }) {
    const {
        message,
        setNodes,
        size,
        setSelectedNodeIds,
        selectedConnectionId,
        setSelectedConnectionId,
        setHoveredNodeId,
        setPendingConnectionCreate,
        setContextMenu,
        setToolbarNodeId,
        setDialogNodeId,
        setEditingNodeId,
        setInfoNodeId,
        setCropNodeId,
        setMaskEditNodeId,
        setEmotionNodeId,
        nodesRef,
        selectedNodeIdsRef,
    } = state;
    const { getCanvasCenter, deleteNodes, deleteConnection, copySelectedNodes, pasteCopiedNodes, undoCanvas, redoCanvas } = interactions;

    const createImageFileNode = useCallback(async (file: File, position: Position, preserveSelection = false, openDialog = true) => {
        const image = await uploadCanvasImage(file);
        const size = fitNodeSize(image.width, image.height);
        const id = `image-${nanoid()}`;
        const newNode: CanvasNodeData = {
            id,
            type: CanvasNodeType.Image,
            title: file.name,
            position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
            width: size.width,
            height: size.height,
            metadata: imageMetadata(image),
        };

        setNodes((prev) => [...prev, newNode]);
        setSelectedNodeIds((current) => (preserveSelection ? new Set([...current, id]) : new Set([id])));
        setSelectedConnectionId(null);
        if (openDialog) setDialogNodeId(id);
        return id;
    }, []);

    const createVideoFileNode = useCallback(async (file: File, position: Position, preserveSelection = false, openDialog = true) => {
        const video = await uploadMediaFile(file, "video");
        const size = fitNodeSize(video.width || 1280, video.height || 720, VIDEO_NODE_MAX_WIDTH, VIDEO_NODE_MAX_HEIGHT);
        const id = `video-${nanoid()}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Video,
                title: file.name,
                position: { x: position.x - size.width / 2, y: position.y - size.height / 2 },
                width: size.width,
                height: size.height,
                metadata: videoMetadata(video),
            },
        ]);
        setSelectedNodeIds((current) => (preserveSelection ? new Set([...current, id]) : new Set([id])));
        setSelectedConnectionId(null);
        if (openDialog) setDialogNodeId(id);
        return id;
    }, []);

    const createAudioFileNode = useCallback(async (file: File, position: Position, preserveSelection = false) => {
        const audio = await uploadMediaFile(file, "audio");
        const spec = NODE_DEFAULT_SIZE[CanvasNodeType.Audio];
        const id = `audio-${nanoid()}`;
        setNodes((prev) => [
            ...prev,
            {
                id,
                type: CanvasNodeType.Audio,
                title: file.name,
                position: { x: position.x - spec.width / 2, y: position.y - spec.height / 2 },
                width: spec.width,
                height: spec.height,
                metadata: audioMetadata(audio),
            },
        ]);
        setSelectedNodeIds((current) => (preserveSelection ? new Set([...current, id]) : new Set([id])));
        setSelectedConnectionId(null);
        return id;
    }, []);

    const createTextNodeFromClipboard = useCallback(
        (text: string) => {
            const trimmed = text.trim();
            if (!trimmed) return false;

            const node = {
                ...createCanvasNode(CanvasNodeType.Text, getCanvasCenter(), { content: trimmed, status: NODE_STATUS_SUCCESS }),
                title: trimmed.slice(0, 32) || "剪切板文本",
            };

            setNodes((prev) => [...prev, node]);
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setDialogNodeId(node.id);
            return true;
        },
        [getCanvasCenter],
    );

    const groupSelectedNodes = useCallback(() => {
        const members = canvasGroupCandidates(nodesRef.current, selectedNodeIdsRef.current);
        if (members.length < CANVAS_GROUP_MIN_MEMBERS) {
            message.info(`请先选择至少 ${CANVAS_GROUP_MIN_MEMBERS} 张未分组的图片`);
            return;
        }

        const memberIds = members.map((member) => member.id);
        const memberIdSet = new Set(memberIds);
        const centroid = canvasGroupCentroid(members);
        const size = canvasGroupSize(members.length);
        const groupId = `${CanvasNodeType.Group}-${nanoid()}`;
        const groupNode: CanvasNodeData = {
            id: groupId,
            type: CanvasNodeType.Group,
            title: "分镜组",
            position: { x: centroid.x - size.width / 2, y: centroid.y - size.height / 2 },
            width: size.width,
            height: size.height,
            metadata: { status: "idle", groupMemberIds: memberIds, groupMemberSnapshots: members.map(canvasGroupMemberSnapshot) },
        };

        setNodes((current) => [...current.map((node) => (memberIdSet.has(node.id) ? { ...node, metadata: { ...node.metadata, groupId } } : node)), groupNode]);
        setSelectedNodeIds(new Set([groupId]));
        setSelectedConnectionId(null);
        setContextMenu(null);
        setToolbarNodeId(null);
        setDialogNodeId(null);
        message.success(`已合并 ${members.length} 张图片为分镜组`);
    }, [message]);

    const dissolveGroup = useCallback(
        (groupNodeId?: string) => {
            const allNodes = nodesRef.current;
            const group = groupNodeId ? allNodes.find((node) => node.id === groupNodeId) : allNodes.find((node) => node.type === CanvasNodeType.Group && selectedNodeIdsRef.current.has(node.id));
            if (!group || group.type !== CanvasNodeType.Group) return;

            // Trust the members' own `groupId` rather than the group's id list —
            // a member deleted while grouped would otherwise leave a dangling id.
            const memberIds = allNodes.filter((node) => node.metadata?.groupId === group.id).map((node) => node.id);
            const layout = canvasGroupRestoreLayout(group, memberIds);

            setNodes((current) =>
                current
                    .filter((node) => node.id !== group.id)
                    .map((node) => {
                        const restored = layout.get(node.id);
                        if (!restored) return node;
                        return { ...node, position: restored.position, width: restored.width, height: restored.height, metadata: { ...node.metadata, groupId: undefined } };
                    }),
            );
            setSelectedNodeIds(new Set(memberIds));
            setSelectedConnectionId(null);
            setContextMenu(null);
            setToolbarNodeId(null);
            setDialogNodeId(null);
            message.success(memberIds.length ? `已解组 ${memberIds.length} 张图片` : "已删除空分镜组");
        },
        [message],
    );

    useEffect(() => {
        const handlePaste = (event: ClipboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || target?.closest("[contenteditable='true'],[data-canvas-no-zoom]")) return;
            if (!event.clipboardData) return;
            const images = clipboardImageFiles(event.clipboardData);
            if (images.length) {
                event.preventDefault();
                setSelectedNodeIds(new Set());
                const center = getCanvasCenter();
                void Promise.allSettled(images.map((file, index) => createImageFileNode(file, { x: center.x + index * CANVAS_DROP_NODE_OFFSET, y: center.y + index * CANVAS_DROP_NODE_OFFSET }, true, false))).then((results) => {
                    const failures = results.filter((result) => result.status === "rejected");
                    if (failures.length) message.error(failures.length === images.length ? "剪切板图片添加失败" : `有 ${failures.length} 张剪切板图片添加失败`);
                    if (failures.length < images.length) message.success(`已从剪切板添加 ${images.length - failures.length} 张图片`);
                });
                return;
            }
            const text = event.clipboardData?.getData("text/plain") || "";
            if (!text.trim()) return;
            event.preventDefault();
            if (createTextNodeFromClipboard(text)) message.success("已从剪切板添加文本");
        };

        window.addEventListener("paste", handlePaste);
        return () => window.removeEventListener("paste", handlePaste);
    }, [createImageFileNode, createTextNodeFromClipboard, getCanvasCenter, message, setSelectedNodeIds]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            const target = event.target instanceof Element ? event.target : null;
            const isEditable = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement || !!target?.closest("[contenteditable='true'],[data-canvas-no-zoom]");
            if (isEditable) {
                const isDeleteKey = event.key === "Delete" || event.key === "Backspace";
                const isEmptyTextarea = event.target instanceof HTMLTextAreaElement && !event.target.value;
                if (!(isDeleteKey && isEmptyTextarea)) return;
            }

            const key = event.key.toLowerCase();
            const isModifierShortcut = event.metaKey || event.ctrlKey;

            if (isModifierShortcut && !event.altKey && key === "z") {
                event.preventDefault();
                if (event.shiftKey) redoCanvas();
                else undoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "y") {
                event.preventDefault();
                redoCanvas();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "a") {
                event.preventDefault();
                setSelectedNodeIds(new Set(nodesRef.current.map((node) => node.id)));
                setSelectedConnectionId(null);
                setContextMenu(null);
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "c") {
                event.preventDefault();
                copySelectedNodes();
                return;
            }

            if (isModifierShortcut && !event.altKey && key === "v") {
                if (pasteCopiedNodes()) event.preventDefault();
                return;
            }

            // Ctrl/Cmd+Alt+G toggles: dissolve when a group is selected, group otherwise.
            if (isModifierShortcut && event.altKey && key === "g") {
                event.preventDefault();
                const selectedIds = selectedNodeIdsRef.current;
                if (nodesRef.current.some((node) => node.type === CanvasNodeType.Group && selectedIds.has(node.id))) dissolveGroup();
                else groupSelectedNodes();
                return;
            }

            if (event.key === "Delete" || event.key === "Backspace") {
                if (selectedNodeIdsRef.current.size) {
                    deleteNodes(new Set(selectedNodeIdsRef.current));
                } else if (selectedConnectionId) {
                    deleteConnection(selectedConnectionId);
                }
            }

            if (event.key === "Escape") {
                setSelectedNodeIds(new Set());
                setSelectedConnectionId(null);
                setContextMenu(null);
                setHoveredNodeId(null);
                setToolbarNodeId(null);
                setDialogNodeId(null);
                setEditingNodeId(null);
                setInfoNodeId(null);
                setCropNodeId(null);
                setMaskEditNodeId(null);
                setEmotionNodeId(null);
                setPendingConnectionCreate(null);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [copySelectedNodes, deleteConnection, deleteNodes, dissolveGroup, groupSelectedNodes, pasteCopiedNodes, redoCanvas, selectedConnectionId, undoCanvas]);
    return {
        createImageFileNode,
        createVideoFileNode,
        createAudioFileNode,
        createTextNodeFromClipboard,
        groupSelectedNodes,
        dissolveGroup,
    };
}

export type CanvasFileActions = ReturnType<typeof useCanvasFileActions>;
