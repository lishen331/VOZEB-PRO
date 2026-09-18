"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button, Modal } from "antd";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { CanvasConfigComposer } from "../components/canvas-config-composer";
import { CanvasConfigNodePanel } from "../components/canvas-config-node-panel";
import { CanvasNodeContextMenu } from "../components/canvas-context-menu";
import { CanvasAssetsPanel } from "../components/canvas-assets-panel";
import { CanvasSurface, type CanvasInteractionMode } from "../components/canvas-surface";
import { CanvasNodeAngleDialog } from "../components/canvas-node-angle-dialog";
import { CanvasNodeEmotionDialog } from "../components/canvas-node-emotion-dialog";
import { CanvasNodeCropDialog } from "../components/canvas-node-crop-dialog";
import { CanvasNodeHoverToolbar, CanvasNodeInfoModal } from "../components/canvas-node-hover-toolbar";
import { CanvasNodeMaskEditDialog } from "../components/canvas-node-mask-edit-dialog";
import { CanvasNodePromptPanel } from "../components/canvas-node-prompt-panel";
import { CanvasNodeSplitDialog } from "../components/canvas-node-split-dialog";
import { CanvasNodeUpscaleDialog } from "../components/canvas-node-upscale-dialog";
import { CanvasToolbar } from "../components/canvas-toolbar";
import { CanvasTopBar } from "../components/canvas-top-bar";
import { CanvasZoomControls } from "../components/canvas-zoom-controls";
import { SchoolProjectBillingBadge } from "@/components/school/school-project-billing-badge";
import { CanvasNodeType, type CanvasNodeData, type Position } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";

const CanvasAssistantPanel = dynamic(() => import("../components/canvas-assistant-panel").then((mod) => mod.CanvasAssistantPanel), { ssr: false });
import { CanvasRefreshShell, ConnectionCreateMenu, NodeCreateMenu } from "./canvas-page-elements";
import { getInputSummary, isHiddenBatchChild } from "./canvas-page-utils";
import { CANVAS_GROUP_MIN_MEMBERS, canvasGroupCandidates, isHiddenCanvasGroupMember } from "../utils/canvas-storyboard-group";
import type { CanvasPanelPlacement } from "../utils/canvas-panel-placement";

export default function CanvasPage() {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) return <CanvasRefreshShell />;

    return <VozebProCanvasPage />;
}

import { useCanvasPageController } from "./use-canvas-page-controller";

// Stable empty array so nodes without mention references don't get a fresh
// `[]` on every render — a new reference here defeats CanvasNode's React.memo.
const EMPTY_MENTION_REFERENCES: CanvasResourceReference[] = [];

function VozebProCanvasPage() {
    const [nodeCreatePosition, setNodeCreatePosition] = useState<Position | null>(null);
    const [interactionMode, setInteractionMode] = useState<CanvasInteractionMode>("pan");
    const controller = useCanvasPageController();
    const hoverCommitHandleRef = useRef<number | null>(null);
    const queuedHoveredNodeIdRef = useRef<string | null>(null);
    const {
        message,
        modal,
        params,
        router,
        projectId,
        containerRef,
        imageInputRef,
        uploadTargetRef,
        clipboardRef,
        historyRef,
        lastHistoryRef,
        historyCommitTimerRef,
        viewportSaveTimerRef,
        applyingHistoryRef,
        didInitialCenterRef,
        toolbarHideTimerRef,
        nodeDraggingRef,
        effectiveConfig,
        isAiConfigReady,
        openConfigDialog,
        addAsset,
        userId,
        hydrated,
        hydratedUserId,
        hydrate,
        loadProject,
        createProject,
        updateProject,
        projectSaveState,
        retryProjectSave,
        renameProject,
        deleteProjects,
        currentProject,
        theme,
        nodes,
        setNodes,
        connections,
        setConnections,
        chatSessions,
        setChatSessions,
        activeChatId,
        setActiveChatId,
        setSize,
        viewport,
        setViewport,
        selectedNodeIds,
        setSelectedNodeIds,
        selectedConnectionId,
        setSelectedConnectionId,
        setHoveredNodeId,
        pendingConnectionCreate,
        setPendingConnectionCreate,
        contextMenu,
        setContextMenu,
        runningNodeId,
        setRunningNodeId,
        isMiniMapOpen,
        setIsMiniMapOpen,
        backgroundMode,
        setBackgroundMode,
        showImageInfo,
        setShowImageInfo,
        clearConfirmOpen,
        setClearConfirmOpen,
        assetPickerOpen,
        setAssetPickerOpen,
        projectLoaded,
        setProjectLoaded,
        toolbarNodeId,
        setToolbarNodeId,
        nodeImageSettingsOpen,
        setNodeImageSettingsOpen,
        dialogNodeId,
        setDialogNodeId,
        editingNodeId,
        setEditingNodeId,
        editRequestNonce,
        setEditRequestNonce,
        infoNodeId,
        setInfoNodeId,
        cropNodeId,
        setCropNodeId,
        maskEditNodeId,
        setMaskEditNodeId,
        splitNodeId,
        setSplitNodeId,
        upscaleNodeId,
        setUpscaleNodeId,
        angleNodeId,
        setAngleNodeId,
        emotionNodeId,
        setEmotionNodeId,
        previewNodeId,
        setPreviewNodeId,
        assistantCollapsed,
        setAssistantCollapsed,
        assistantMounted,
        setAssistantMounted,
        assistantClosing,
        setAssistantClosing,
        titleEditing,
        setTitleEditing,
        titleDraft,
        setTitleDraft,
        historyState,
        setHistoryState,
        collapsingBatchIds,
        setCollapsingBatchIds,
        openingBatchIds,
        setOpeningBatchIds,
        isNodeDragging,
        setIsNodeDragging,
        nodesRef,
        connectionsRef,
        selectedNodeIdsRef,
        viewportRef,
        displayViewportRef,
        generateNodeRef,
        agentCloseTimerRef,
        autoOpenedAgentRef,
        pendingConnectionCreateRef,
        generationRequestsRef,
        resumingImageTaskIdsRef,
        resumingVideoTaskIdsRef,
        resumingTextTaskIdsRef,
        resumingAudioTaskIdsRef,
        createHistoryEntry,
        startGenerationRequest,
        finishGenerationRequest,
        stopGenerationByRunningId,
        confirmStopGeneration,
        completeVideoTask,
        completeImageTask,
        startAndCompleteImageTask,
        completeTextTask,
        completeAudioTask,
        getCanvasCenter,
        keepNodeToolbar,
        connectNodes,
        createConnectedNode,
        cancelPendingConnectionCreate,
        toolbarNode,
        infoNode,
        cropNode,
        maskEditNode,
        splitNode,
        upscaleNode,
        angleNode,
        emotionNode,
        previewNode,
        hasMultipleSelectedNodes,
        activeNodeId,
        batchChildCountById,
        batchMotionById,
        relatedHighlight,
        configInputsById,
        resourceContextNodeId,
        canvasResourceReferences,
        resourceReferenceByNodeId,
        mentionReferencesByNodeId,
        agentSnapshot,
        applyAgentOps,
        createNode,
        deleteNodes,
        deleteConnection,
        deselectCanvas,
        clearCanvas,
        duplicateNode,
        copySelectedNodes,
        pasteCopiedNodes,
        resetViewport,
        locateCanvasNode,
        setZoomScale,
        applyHistory,
        undoCanvas,
        redoCanvas,
        autoLayout,
        createAndOpenProject,
        deleteCurrentProject,
        createImageFileNode,
        createVideoFileNode,
        createAudioFileNode,
        createTextNodeFromClipboard,
        handleImageDimensions,
        toggleNodeFreeResize,
        handleNodeContentChange,
        toggleBatchExpanded,
        setBatchPrimary,
        openTextEditor,
        handleNodePromptChange,
        handleConfigNodeChange,
        downloadNodeImage,
        downloadSelectedMedia,
        selectedMediaCount,
        selectedMediaDownloadPending,
        saveNodeAsset,
        createImageReversePromptNodes,
        appendDerivedImageNode,
        cropImageNode,
        splitImageNode,
        splitImageLayers,
        removeBackgroundImageNode,
        maskEditImageNode,
        emotionEditImageNode,
        upscaleImageNode,
        generateAngleNode,
        handleFontSizeChange,
        handleUploadRequest,
        handleImageInputChange,
        handleDrop,
        pasteAssistantImage,
        handleAssistantSessionsChange,
        startTitleEditing,
        finishTitleEditing,
        preventCanvasContextMenu,
        handleGenerateNode,
        handleRetryNode,
        generateImageFromTextNode,
        insertAssistantImage,
        insertAssistantText,
        handleAssetInsert,
        assistantOpen,
        openAgent,
        closeAgent,
        groupSelectedNodes,
        dissolveGroup,
    } = controller;
    const scheduleHoveredNode = useCallback(
        (nodeId: string | null) => {
            queuedHoveredNodeIdRef.current = nodeId;
            if (hoverCommitHandleRef.current !== null) return;
            const commit = () => {
                hoverCommitHandleRef.current = null;
                setHoveredNodeId(queuedHoveredNodeIdRef.current);
            };
            const requestIdle = (window as Window & { requestIdleCallback?: (callback: () => void) => number }).requestIdleCallback;
            hoverCommitHandleRef.current = requestIdle ? requestIdle(commit) : requestAnimationFrame(commit);
        },
        [setHoveredNodeId],
    );
    useEffect(
        () => () => {
            if (hoverCommitHandleRef.current === null) return;
            const cancelIdle = (window as Window & { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback;
            if (cancelIdle) cancelIdle(hoverCommitHandleRef.current);
            else cancelAnimationFrame(hoverCommitHandleRef.current);
        },
        [],
    );
    const nodesById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
    const hiddenCanvasNodeIds = useMemo(() => new Set(nodes.filter((node) => isHiddenBatchChild(node, nodesById, collapsingBatchIds) || isHiddenCanvasGroupMember(node, nodesById)).map((node) => node.id)), [collapsingBatchIds, nodes, nodesById]);
    const handleNodeHoverStart = useCallback(
        (nodeId: string) => {
            if (nodeDraggingRef.current) return;
            scheduleHoveredNode(nodeId);
        },
        [nodeDraggingRef, scheduleHoveredNode],
    );
    const handleNodeHoverEnd = useCallback(
        (nodeId: string) => {
            if (queuedHoveredNodeIdRef.current === nodeId) scheduleHoveredNode(null);
        },
        [scheduleHoveredNode],
    );
    const handleNodeRetry = useCallback((node: CanvasNodeData) => void handleRetryNode(node), [handleRetryNode]);
    const handleNodeOpenPanel = useCallback(
        (node: CanvasNodeData) => {
            setSelectedNodeIds(new Set([node.id]));
            setSelectedConnectionId(null);
            setToolbarNodeId(node.id);
            setDialogNodeId(node.id);
        },
        [setSelectedNodeIds, setSelectedConnectionId, setToolbarNodeId, setDialogNodeId],
    );
    const handleNodeViewImage = useCallback((node: CanvasNodeData) => setPreviewNodeId(node.id), [setPreviewNodeId]);
    // Lifted out of CanvasNode so the hover toolbar — a sibling, not a child —
    // can step aside when a panel claims the band above its node. Keyed by node
    // id so a stale placement never leaks onto a different node's toolbar.
    const [panelPlacement, setPanelPlacement] = useState<{ nodeId: string; placement: CanvasPanelPlacement } | null>(null);
    const handlePanelPlacementChange = useCallback((nodeId: string, placement: CanvasPanelPlacement) => {
        setPanelPlacement((current) => (current?.nodeId === nodeId && current.placement === placement ? current : { nodeId, placement }));
    }, []);
    const nodeProps = useMemo(
        () => ({
            onHoverStart: handleNodeHoverStart,
            onHoverEnd: handleNodeHoverEnd,
            onContentChange: handleNodeContentChange,
            onToggleBatch: toggleBatchExpanded,
            onSetBatchPrimary: setBatchPrimary,
            onRetry: handleNodeRetry,
            onGenerateImage: generateImageFromTextNode,
            onOpenPanel: handleNodeOpenPanel,
            onImageDimensions: handleImageDimensions,
            onViewImage: handleNodeViewImage,
            onPanelPlacementChange: handlePanelPlacementChange,
        }),
        [handleNodeHoverStart, handleNodeHoverEnd, handleNodeContentChange, toggleBatchExpanded, setBatchPrimary, handleNodeRetry, generateImageFromTextNode, handleNodeOpenPanel, handleImageDimensions, handleNodeViewImage, handlePanelPlacementChange],
    );
    const getNodeViewProps = useCallback(
        (node: CanvasNodeData) => ({
            editRequestNonce: editingNodeId === node.id ? editRequestNonce : 0,
            showPanel: dialogNodeId === node.id,
            batchCount: batchChildCountById.get(node.id) || 0,
            batchExpanded: Boolean(node.metadata?.imageBatchExpanded),
            batchClosing: Boolean(node.metadata?.batchRootId && collapsingBatchIds.has(node.metadata.batchRootId)),
            batchOpening: openingBatchIds.has(node.id),
            batchRecovering: collapsingBatchIds.has(node.id),
            batchMotion: batchMotionById.get(node.id),
            showImageInfo,
            resourceLabel: resourceReferenceByNodeId.get(node.id),
            mentionReferences: mentionReferencesByNodeId.get(node.id) || EMPTY_MENTION_REFERENCES,
        }),
        [editingNodeId, editRequestNonce, dialogNodeId, batchChildCountById, collapsingBatchIds, openingBatchIds, batchMotionById, showImageInfo, resourceReferenceByNodeId, mentionReferencesByNodeId],
    );
    const renderCanvasPanel = useCallback(
        (panelNode: CanvasNodeData) =>
            panelNode.type === CanvasNodeType.Config ? (
                <CanvasConfigComposer
                    value={panelNode.metadata?.composerContent ?? panelNode.metadata?.prompt ?? ""}
                    inputs={configInputsById.get(panelNode.id) || []}
                    onChange={(composerContent) => handleConfigNodeChange(panelNode.id, { composerContent })}
                    onClose={() => setDialogNodeId(null)}
                />
            ) : (
                <CanvasNodePromptPanel
                    node={panelNode}
                    isRunning={runningNodeId === panelNode.id}
                    mentionReferences={mentionReferencesByNodeId.get(panelNode.id) || EMPTY_MENTION_REFERENCES}
                    onPromptChange={handleNodePromptChange}
                    onConfigChange={handleConfigNodeChange}
                    onGenerate={handleGenerateNode}
                    onStop={confirmStopGeneration}
                    onImageSettingsOpenChange={(open) => {
                        setNodeImageSettingsOpen(open);
                        if (open) setToolbarNodeId(null);
                    }}
                    onRemoveReference={(sourceNodeId) => {
                        const conn = connectionsRef.current.find((c) => c.fromNodeId === sourceNodeId && c.toNodeId === panelNode.id);
                        if (conn) deleteConnection(conn.id);
                    }}
                />
            ),
        [configInputsById, runningNodeId, mentionReferencesByNodeId, handleNodePromptChange, handleConfigNodeChange, handleGenerateNode, confirmStopGeneration, setDialogNodeId, setNodeImageSettingsOpen, setToolbarNodeId, connectionsRef, deleteConnection],
    );
    const renderCanvasNode = useCallback(
        (contentNode: CanvasNodeData) => (
            <CanvasConfigNodePanel
                node={contentNode}
                isRunning={runningNodeId === contentNode.id}
                inputSummary={getInputSummary(configInputsById.get(contentNode.id) || [])}
                references={mentionReferencesByNodeId.get(contentNode.id) || EMPTY_MENTION_REFERENCES}
                onConfigChange={handleConfigNodeChange}
                onComposerToggle={() => setDialogNodeId((current) => (current === contentNode.id ? null : contentNode.id))}
                onStop={confirmStopGeneration}
                onGenerate={(nodeId) => {
                    const target = nodesRef.current.find((item) => item.id === nodeId);
                    void handleGenerateNode(nodeId, target?.metadata?.generationMode || "image", target?.metadata?.composerContent ?? target?.metadata?.prompt ?? "");
                }}
            />
        ),
        [runningNodeId, configInputsById, mentionReferencesByNodeId, handleConfigNodeChange, confirmStopGeneration, setDialogNodeId, nodesRef, handleGenerateNode],
    );
    const handleNodeContextMenu = useCallback(
        (event: React.MouseEvent, id: string) => {
            event.preventDefault();
            event.stopPropagation();
            setDialogNodeId(null);
            setEditingNodeId(null);
            setToolbarNodeId(null);
            setContextMenu({ type: "node", x: event.clientX, y: event.clientY, nodeId: id });
        },
        [setDialogNodeId, setEditingNodeId, setToolbarNodeId, setContextMenu],
    );
    const canGroupSelection = useMemo(() => canvasGroupCandidates(nodes, selectedNodeIds).length >= CANVAS_GROUP_MIN_MEMBERS, [nodes, selectedNodeIds]);
    const selectedGroupCount = useMemo(() => nodes.filter((node) => node.type === CanvasNodeType.Group && selectedNodeIds.has(node.id)).length, [nodes, selectedNodeIds]);
    const contextMenuNode = contextMenu?.type === "node" ? nodes.find((node) => node.id === contextMenu.nodeId) : undefined;
    if (!projectLoaded) return <CanvasRefreshShell />;
    return (
        <main className="flex h-full min-h-0 w-full min-w-0 max-w-full overflow-hidden" style={{ background: theme.canvas.backdrop, color: theme.node.text }}>
            <CanvasAssetsPanel
                open={assetPickerOpen}
                projectId={projectId}
                projectTitle={currentProject?.title || "未命名画布"}
                nodes={nodes}
                onOpenProject={(id) => {
                    void loadProject(id).catch(() => undefined);
                    router.push(`/canvas/${id}`);
                }}
                onOpenProjects={() => router.push("/canvas")}
                onCreateProject={createAndOpenProject}
                onInsertAsset={handleAssetInsert}
                onInsertPrompt={insertAssistantText}
                onLocateNode={locateCanvasNode}
                onClose={() => setAssetPickerOpen(false)}
            />
            <section className="relative min-w-0 max-w-full flex-1 overflow-hidden">
                <CanvasTopBar
                    title={currentProject?.title || "未命名画布"}
                    practice={currentProject?.executionProfile === "open-source-practice"}
                    titleDraft={titleDraft}
                    isTitleEditing={titleEditing}
                    onTitleDraftChange={setTitleDraft}
                    onStartTitleEditing={startTitleEditing}
                    onFinishTitleEditing={finishTitleEditing}
                    onCancelTitleEditing={() => setTitleEditing(false)}
                    saveState={projectSaveState}
                    onRetrySave={() => retryProjectSave(projectId)}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    onWorkbench={() => router.push("/create")}
                    onDeleteProject={deleteCurrentProject}
                    onImportImage={() => handleUploadRequest()}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    assetsOpen={assetPickerOpen}
                    onToggleAssets={() => setAssetPickerOpen((value) => !value)}
                    agentOpen={assistantOpen}
                    onToggleAgent={() => (assistantOpen ? closeAgent() : openAgent())}
                />
                <div className="pointer-events-none absolute left-3 top-20 z-40 max-w-[calc(100%-1.5rem)] sm:left-6">
                    <div className="pointer-events-auto">
                        <SchoolProjectBillingBadge surface="canvas" projectId={projectId} executionProfile={currentProject?.executionProfile} />
                    </div>
                </div>

                <CanvasSurface
                    containerRef={containerRef}
                    nodes={nodes}
                    hiddenNodeIds={hiddenCanvasNodeIds}
                    connections={connections}
                    viewport={viewport}
                    backgroundMode={backgroundMode}
                    interactionMode={interactionMode}
                    minimapOpen={isMiniMapOpen}
                    selectedNodeIds={selectedNodeIds}
                    selectedConnectionId={selectedConnectionId}
                    relatedNodeIds={relatedHighlight.nodeIds}
                    relatedConnectionIds={relatedHighlight.connectionIds}
                    nodeProps={nodeProps}
                    getNodeViewProps={getNodeViewProps}
                    renderPanel={renderCanvasPanel}
                    renderNode={renderCanvasNode}
                    onNodesCommit={(updates) => {
                        const updatesById = new Map(updates.map((update) => [update.id, update]));
                        setNodes((current) =>
                            current.map((node) => {
                                const update = updatesById.get(node.id);
                                return update
                                    ? {
                                          ...node,
                                          position: update.position ?? node.position,
                                          width: update.width ?? node.width,
                                          height: update.height ?? node.height,
                                      }
                                    : node;
                            }),
                        );
                    }}
                    onSelectionChange={(nodeIds, connectionId) => {
                        setSelectedNodeIds(nodeIds);
                        setSelectedConnectionId(connectionId);
                        setToolbarNodeId(nodeIds.size === 1 && !connectionId ? Array.from(nodeIds)[0] : null);
                        setContextMenu(null);
                    }}
                    onViewportCommit={(next) => {
                        setViewport(next);
                        // The context menu is screen-anchored, so a viewport change
                        // orphans it — close it. The node-create menu is anchored to
                        // a world position and scale-compensated, so it correctly
                        // follows pan/zoom and must survive this commit.
                        setContextMenu(null);
                    }}
                    onConnect={({ source, target }) => connectNodes({ nodeId: source, handleType: "source" }, target)}
                    onConnectionCreate={({ nodeId, handleType, position }) => setPendingConnectionCreate({ connection: { nodeId, handleType }, position })}
                    onPaneClick={() => {
                        setNodeCreatePosition(null);
                        deselectCanvas();
                    }}
                    onPaneDoubleClick={(position) => {
                        setContextMenu(null);
                        setNodeCreatePosition(position);
                    }}
                    onPaneContextMenu={(event) => preventCanvasContextMenu(event as React.MouseEvent)}
                    onNodeContextMenu={handleNodeContextMenu}
                    onEdgeContextMenu={(event, id) => {
                        setSelectedConnectionId(id);
                        setSelectedNodeIds(new Set());
                        setToolbarNodeId(null);
                        setContextMenu({ type: "connection", x: event.clientX, y: event.clientY, connectionId: id });
                    }}
                    onDrop={(event) => handleDrop(event as React.DragEvent<HTMLDivElement>)}
                    onSizeChange={setSize}
                    onDragStateChange={(dragging) => {
                        nodeDraggingRef.current = dragging;
                        setIsNodeDragging(dragging);
                    }}
                    onDisplayViewportChange={(next) => {
                        displayViewportRef.current = next;
                    }}
                    overlay={
                        <>
                            {pendingConnectionCreate ? <ConnectionCreateMenu pending={pendingConnectionCreate} onCreate={(type) => createConnectedNode(type, pendingConnectionCreate)} onClose={cancelPendingConnectionCreate} /> : null}
                            {nodeCreatePosition ? (
                                <NodeCreateMenu
                                    position={nodeCreatePosition}
                                    onCreate={(type) => {
                                        createNode(type, nodeCreatePosition);
                                        setNodeCreatePosition(null);
                                    }}
                                    onClose={() => setNodeCreatePosition(null)}
                                />
                            ) : null}
                        </>
                    }
                />

                <CanvasNodeHoverToolbar
                    node={isNodeDragging || nodeImageSettingsOpen ? null : toolbarNode}
                    viewport={viewport}
                    panelPlacement={toolbarNode && panelPlacement?.nodeId === toolbarNode.id ? panelPlacement.placement : "bottom"}
                    onKeep={keepNodeToolbar}
                    onInfo={(node) => setInfoNodeId(node.id)}
                    onEditText={openTextEditor}
                    onDecreaseFont={(node) => handleFontSizeChange(node.id, Math.max(10, (node.metadata?.fontSize || 14) - 2))}
                    onIncreaseFont={(node) => handleFontSizeChange(node.id, Math.min(32, (node.metadata?.fontSize || 14) + 2))}
                    onToggleDialog={(node) => setDialogNodeId((current) => (current === node.id ? null : node.id))}
                    onGenerateImage={generateImageFromTextNode}
                    onUpload={(node) => handleUploadRequest(node.id)}
                    onDownload={downloadNodeImage}
                    onSaveAsset={(node) => void saveNodeAsset(node).catch((error) => message.error(error instanceof Error ? error.message : "素材保存失败"))}
                    onMaskEdit={(node) => setMaskEditNodeId(node.id)}
                    onCrop={(node) => setCropNodeId(node.id)}
                    onSplit={(node) => setSplitNodeId(node.id)}
                    onSplitLayers={(node) => void splitImageLayers(node).catch((error) => message.error(error instanceof Error ? error.message : "智能分层失败"))}
                    onRemoveBackground={(node) => void removeBackgroundImageNode(node).catch((error) => message.error(error instanceof Error ? error.message : "消除背景失败"))}
                    onEmotion={(node) => setEmotionNodeId(node.id)}
                    onUpscale={(node) => setUpscaleNodeId(node.id)}
                    onSuperResolve={(node) => setUpscaleNodeId(node.id)}
                    onAngle={(node) => setAngleNodeId(node.id)}
                    onViewImage={(node) => setPreviewNodeId(node.id)}
                    onReversePrompt={createImageReversePromptNodes}
                    onRetry={(node) => void handleRetryNode(node)}
                    onToggleFreeResize={(node) => toggleNodeFreeResize(node.id)}
                    onDelete={(node) => deleteNodes(new Set([node.id]))}
                />

                <CanvasToolbar
                    selectedCount={selectedNodeIds.size}
                    selectedMediaCount={selectedMediaCount}
                    selectedMediaDownloadPending={selectedMediaDownloadPending}
                    canGroupSelection={canGroupSelection}
                    selectedGroupCount={selectedGroupCount}
                    canUndo={historyState.canUndo}
                    canRedo={historyState.canRedo}
                    agentOpen={assistantOpen}
                    backgroundMode={backgroundMode}
                    interactionMode={interactionMode}
                    showImageInfo={showImageInfo}
                    onAddImage={() => createNode(CanvasNodeType.Image)}
                    onAddPanorama={() => createNode(CanvasNodeType.Panorama)}
                    onAddVideo={() => createNode(CanvasNodeType.Video)}
                    onAddAudio={() => createNode(CanvasNodeType.Audio)}
                    onAddText={() => createNode(CanvasNodeType.Text)}
                    onAddConfig={() => createNode(CanvasNodeType.Config)}
                    onUndo={undoCanvas}
                    onRedo={redoCanvas}
                    onUpload={() => handleUploadRequest()}
                    onDownloadSelectedMedia={() => void downloadSelectedMedia()}
                    onGroupNodes={groupSelectedNodes}
                    onDissolveGroup={() => dissolveGroup()}
                    onDelete={() => deleteNodes(new Set(selectedNodeIds))}
                    onClear={() => setClearConfirmOpen(true)}
                    onInteractionModeChange={setInteractionMode}
                    onBackgroundModeChange={setBackgroundMode}
                    onShowImageInfoChange={setShowImageInfo}
                    onOpenAssets={() => {
                        setAssetPickerOpen(true);
                    }}
                    onAutoLayout={autoLayout}
                />

                <CanvasZoomControls scale={viewport.k} onScaleChange={setZoomScale} onReset={resetViewport} isMiniMapOpen={isMiniMapOpen} onToggleMiniMap={() => setIsMiniMapOpen((value) => !value)} />

                {contextMenu ? (
                    <CanvasNodeContextMenu
                        menu={contextMenu}
                        onClose={() => setContextMenu(null)}
                        onDuplicate={() => {
                            if (contextMenu.type !== "node") return;
                            duplicateNode(contextMenu.nodeId);
                            setContextMenu(null);
                        }}
                        onDissolveGroup={
                            contextMenuNode?.type === CanvasNodeType.Group
                                ? () => {
                                      dissolveGroup(contextMenuNode.id);
                                      setContextMenu(null);
                                  }
                                : undefined
                        }
                        onDelete={() => {
                            if (contextMenu.type === "node") {
                                const selectedIds = selectedNodeIdsRef.current;
                                deleteNodes(selectedIds.has(contextMenu.nodeId) ? new Set(selectedIds) : new Set([contextMenu.nodeId]));
                            } else {
                                deleteConnection(contextMenu.connectionId);
                            }
                            setContextMenu(null);
                        }}
                    />
                ) : null}

                <input ref={imageInputRef} type="file" accept="image/*,video/*,audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav" className="hidden" onChange={handleImageInputChange} />

                <CanvasNodeInfoModal node={infoNode} open={Boolean(infoNode)} onClose={() => setInfoNodeId(null)} />

                {cropNode?.metadata?.content ? (
                    <CanvasNodeCropDialog
                        dataUrl={cropNode.metadata.content}
                        open={Boolean(cropNode)}
                        onClose={() => setCropNodeId(null)}
                        onConfirm={(crop) => void cropImageNode(cropNode!, crop).catch((error) => message.error(error instanceof Error ? error.message : "图片裁剪失败"))}
                    />
                ) : null}

                {maskEditNode?.metadata?.content ? (
                    <CanvasNodeMaskEditDialog dataUrl={maskEditNode.metadata.content} open={Boolean(maskEditNode)} onClose={() => setMaskEditNodeId(null)} onConfirm={(payload) => void maskEditImageNode(maskEditNode!, payload)} />
                ) : null}

                {splitNode?.metadata?.content ? (
                    <CanvasNodeSplitDialog
                        dataUrl={splitNode.metadata.content}
                        open={Boolean(splitNode)}
                        onClose={() => setSplitNodeId(null)}
                        onConfirm={(params) => void splitImageNode(splitNode!, params).catch((error) => message.error(error instanceof Error ? error.message : "图片切分失败"))}
                    />
                ) : null}

                {upscaleNode?.metadata?.content ? (
                    <CanvasNodeUpscaleDialog
                        dataUrl={upscaleNode.metadata.content}
                        open={Boolean(upscaleNode)}
                        onClose={() => setUpscaleNodeId(null)}
                        onConfirm={(params) => void upscaleImageNode(upscaleNode!, params).catch((error) => message.error(error instanceof Error ? error.message : "图片放大失败"))}
                    />
                ) : null}

                {angleNode?.metadata?.content ? <CanvasNodeAngleDialog dataUrl={angleNode.metadata.content} open={Boolean(angleNode)} onClose={() => setAngleNodeId(null)} onConfirm={(params) => void generateAngleNode(angleNode!, params)} /> : null}

                {emotionNode?.metadata?.content ? (
                    <CanvasNodeEmotionDialog dataUrl={emotionNode.metadata.content} open={Boolean(emotionNode)} onClose={() => setEmotionNodeId(null)} onConfirm={(payload) => void emotionEditImageNode(emotionNode!, payload)} />
                ) : null}

                <Modal
                    title="图片详情"
                    open={Boolean(previewNode?.metadata?.content)}
                    centered
                    onCancel={() => setPreviewNodeId(null)}
                    footer={null}
                    width="auto"
                    styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "80vh" } }}
                >
                    {previewNode?.metadata?.content ? <img src={imagePreviewUrl(previewNode.metadata.content, 1920)} alt={previewNode.title || "图片"} style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain" }} /> : null}
                </Modal>

                <Modal
                    title="清空画布？"
                    open={clearConfirmOpen}
                    centered
                    onCancel={() => setClearConfirmOpen(false)}
                    footer={
                        <>
                            <Button onClick={() => setClearConfirmOpen(false)}>取消</Button>
                            <Button danger type="primary" onClick={clearCanvas}>
                                清空
                            </Button>
                        </>
                    }
                >
                    <p className="text-sm opacity-60">这会删除当前画布上的所有节点和连线。</p>
                </Modal>
            </section>
            {assistantMounted ? (
                <CanvasAssistantPanel
                    nodes={nodes}
                    selectedNodeIds={selectedNodeIds}
                    snapshot={agentSnapshot}
                    sessions={chatSessions}
                    activeSessionId={activeChatId}
                    onSelectNodeIds={setSelectedNodeIds}
                    onSessionsChange={handleAssistantSessionsChange}
                    onApplyOps={applyAgentOps}
                    onLocateNode={locateCanvasNode}
                    onPasteImage={pasteAssistantImage}
                    closing={assistantClosing}
                    onCollapse={closeAgent}
                />
            ) : null}
        </main>
    );
}
