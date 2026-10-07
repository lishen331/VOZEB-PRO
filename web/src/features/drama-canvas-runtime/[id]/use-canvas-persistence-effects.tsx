"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef } from "react";

import { CanvasNodeType, isCanvasImageNodeType, type CanvasNodeData } from "../types";

import { NODE_STATUS_LOADING } from "./canvas-page-elements";
import { buildGenerationConfig, isGenerationCanceled, normalizeCanvasConfigNodeLayout, prepareAssistantImages, prepareCanvasImages } from "./canvas-page-utils";
import {
    CANVAS_GENERATION_RETRY_DELAY_MS,
    CANVAS_GENERATION_TIMEOUT_ABORT,
    canvasGenerationPendingOptions,
    canvasGenerationPendingState,
    failCanvasGeneration,
    isCanvasGenerationPendingExpired,
    isCanvasGenerationRetryable,
    markCanvasGenerationPending,
    restoreCanvasGenerationPending,
    stampCanvasGenerationStart,
    toCanvasGenerationUserMessage,
    type CanvasGenerationTaskKind,
} from "./canvas-generation-feedback";

import type { CanvasPageState } from "./use-canvas-page-state";
import type { CanvasTaskRuntime } from "./use-canvas-task-runtime";

function resumableTaskKind(node: CanvasNodeData): CanvasGenerationTaskKind | undefined {
    const metadata = node.metadata;
    if (isCanvasImageNodeType(node.type) && metadata?.imageTask) return "image";
    if (node.type === CanvasNodeType.Video && metadata?.videoTask) return "video";
    if (node.type === CanvasNodeType.Text && metadata?.textTask) return "text";
    if (node.type === CanvasNodeType.Audio && metadata?.audioTask) return "audio";
    return undefined;
}

export function useCanvasPersistenceEffects({ state, tasks }: { state: CanvasPageState; tasks: CanvasTaskRuntime }) {
    const skipInitialProjectSyncRef = useRef(false);
    const pendingRetryTimersRef = useRef(new Map<string, number>());
    const [pendingRetryNonce, triggerPendingRetry] = useReducer((value: number) => value + 1, 0);
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
        hydrate,
        loadProject,
        createProject,
        updateProject,
        flushProjectSave,
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
        viewport,
        setViewport,
        size,
        setSize,
        selectedNodeIds,
        setSelectedNodeIds,
        selectedConnectionId,
        setSelectedConnectionId,
        hoveredNodeId,
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
        generateNodeRef,
        agentCloseTimerRef,
        autoOpenedAgentRef,
        pendingConnectionCreateRef,
        generationRequestsRef,
        resumingImageTaskIdsRef,
        resumingVideoTaskIdsRef,
        resumingTextTaskIdsRef,
        resumingAudioTaskIdsRef,
    } = state;
    const {
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
        recoverAndCompleteVideoTask,
        recoverAndCompleteImageTask,
        recoverAndCompleteTextTask,
        recoverAndCompleteAudioTask,
    } = tasks;
    const clearCanvasLayerProgress = (nodeId: string) => {
        const sourceNodeId = nodesRef.current.find((node) => node.id === nodeId)?.metadata?.sourceLayerNodeId || nodeId;
        message.destroy(`canvas-layers-${sourceNodeId}`);
        message.destroy(`canvas-subject-${sourceNodeId}`);
    };
    /** 15 秒后再查一次：轮询 key 不变时靠 nonce 让恢复 effect 重新跑。 */
    const scheduleResumeRetry = useCallback((nodeId: string) => {
        const existing = pendingRetryTimersRef.current.get(nodeId);
        if (existing) window.clearTimeout(existing);
        const timer = window.setTimeout(() => {
            pendingRetryTimersRef.current.delete(nodeId);
            triggerPendingRetry();
        }, CANVAS_GENERATION_RETRY_DELAY_MS);
        pendingRetryTimersRef.current.set(nodeId, timer);
    }, []);

    useEffect(
        () => () => {
            pendingRetryTimersRef.current.forEach((timer) => window.clearTimeout(timer));
            pendingRetryTimersRef.current.clear();
        },
        [],
    );

    useEffect(() => {
        if (userId) void hydrate();
    }, [hydrate, userId]);

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        setProjectLoaded(false);
        void loadProject(projectId, true)
            .then((project) => {
                const restoredNodes = restoreCanvasGenerationPending(prepareCanvasImages(project.nodes).map(normalizeCanvasConfigNodeLayout));
                const restoredSessions = prepareAssistantImages(project.chatSessions || []);
                if (cancelled) return;
                skipInitialProjectSyncRef.current = true;
                setNodes(restoredNodes);
                setConnections(project.connections);
                setChatSessions(restoredSessions);
                setActiveChatId(project.activeChatId || null);
                setBackgroundMode(project.backgroundMode);
                setShowImageInfo(project.showImageInfo || false);
                setViewport(project.viewport);
                didInitialCenterRef.current = Boolean(restoredNodes.length || project.connections.length || project.viewport.x || project.viewport.y || project.viewport.k !== 1 || project.createdAt !== project.updatedAt);
                historyRef.current = { past: [], future: [] };
                if (historyCommitTimerRef.current) {
                    clearTimeout(historyCommitTimerRef.current);
                    historyCommitTimerRef.current = null;
                }
                lastHistoryRef.current = {
                    nodes: restoredNodes,
                    connections: project.connections,
                    chatSessions: restoredSessions,
                    activeChatId: project.activeChatId || null,
                    backgroundMode: project.backgroundMode,
                    showImageInfo: project.showImageInfo || false,
                };
                setHistoryState({ canUndo: false, canRedo: false });
                setProjectLoaded(true);
            })
            .catch((error) => {
                if (cancelled) return;
                const text = error instanceof Error ? error.message : "画布项目加载失败";
                if (text.includes("不存在")) router.replace("/drama-lab");
                else message.error(text);
            });
        return () => {
            cancelled = true;
        };
    }, [loadProject, message, projectId, router, userId]);

    // Stable comma-joined id list of loading nodes that still own a task. The
    // resume effect only re-runs when that set shifts (or a retry timer fires),
    // not on every streaming token update. Node objects are read from
    // nodesRef.current, which the useLayoutEffect at the bottom keeps in sync.
    const resumableTaskKey = useMemo(
        () =>
            nodes
                .filter((node) => node.metadata?.status === NODE_STATUS_LOADING && resumableTaskKind(node))
                .map((node) => node.id)
                .join(","),
        [nodes],
    );

    /**
     * 恢复一个仍在生成中的任务：
     * - 正常拿到结果 → 正常显示；
     * - 暂时查不到（needs_review / 查询超时 / 追查接口 409 等）→ 继续"生成中"，15 秒后再查；
     *   needs_review 下一轮会主动追查原任务（替代原来的"检查状态"按钮）；
     * - 等待超过兜底时长 → 显示"网络繁忙"；
     * - 上游明确失败 → 显示转换后的文案（政策类原因 / 网络繁忙）。
     * 真实原因只进控制台，后端记录保持原样。
     */
    const resumeGenerationTask = useCallback(
        (node: CanvasNodeData, kind: CanvasGenerationTaskKind) => {
            const resumingRef = { image: resumingImageTaskIdsRef, video: resumingVideoTaskIdsRef, text: resumingTextTaskIdsRef, audio: resumingAudioTaskIdsRef }[kind];
            if (resumingRef.current.has(node.id)) return;
            if (isCanvasGenerationPendingExpired(node)) {
                console.warn("[canvas-generation] pending timeout reached:", node.id);
                setNodes((prev) => failCanvasGeneration(prev, [node.id]));
                return;
            }
            const metadata = node.metadata;
            const review = canvasGenerationPendingState(node)?.review === true;
            resumingRef.current.add(node.id);
            const controller = startGenerationRequest(node.id, node.id, node.id);
            const generationConfig = buildGenerationConfig(effectiveConfig, node, kind);
            setRunningNodeId((current) => current || node.id);
            const run = async () => {
                if (kind === "image" && metadata?.imageTask) {
                    const options = { outputBackground: metadata.imageOutputBackground, outputMode: metadata.imageOutputMode };
                    return review ? recoverAndCompleteImageTask(node.id, generationConfig, metadata.imageTask, controller, metadata.prompt, options) : completeImageTask(node.id, generationConfig, metadata.imageTask, controller, metadata.prompt);
                }
                if (kind === "video" && metadata?.videoTask) {
                    return review ? recoverAndCompleteVideoTask(node.id, generationConfig, metadata.videoTask, controller, metadata.prompt) : completeVideoTask(node.id, generationConfig, metadata.videoTask, controller, metadata.prompt);
                }
                if (kind === "text" && metadata?.textTask) {
                    return review ? recoverAndCompleteTextTask(node.id, generationConfig, metadata.textTask, controller, metadata.prompt) : completeTextTask(node.id, generationConfig, metadata.textTask, controller, metadata.prompt);
                }
                if (kind === "audio" && metadata?.audioTask) {
                    return review ? recoverAndCompleteAudioTask(node.id, generationConfig, metadata.audioTask, controller, metadata.prompt) : completeAudioTask(node.id, generationConfig, metadata.audioTask, controller, metadata.prompt);
                }
            };
            void run()
                .catch((error) => {
                    if (isGenerationCanceled(error)) return;
                    clearCanvasLayerProgress(node.id);
                    if (isCanvasGenerationRetryable(error, { review, video: kind === "video" })) {
                        const options = canvasGenerationPendingOptions(error);
                        setNodes((prev) => markCanvasGenerationPending(prev, [node.id], options));
                        scheduleResumeRetry(node.id);
                        return;
                    }
                    const errorDetails = toCanvasGenerationUserMessage(error);
                    message.error(errorDetails);
                    setNodes((prev) => failCanvasGeneration(prev, [node.id], errorDetails));
                })
                .finally(() => {
                    resumingRef.current.delete(node.id);
                    finishGenerationRequest(node.id, controller);
                    setRunningNodeId((current) => (current === node.id ? null : current));
                });
        },
        [
            completeAudioTask,
            completeImageTask,
            completeTextTask,
            completeVideoTask,
            effectiveConfig,
            finishGenerationRequest,
            message,
            recoverAndCompleteAudioTask,
            recoverAndCompleteImageTask,
            recoverAndCompleteTextTask,
            recoverAndCompleteVideoTask,
            scheduleResumeRetry,
            startGenerationRequest,
        ],
    );

    useEffect(() => {
        if (!projectLoaded) return;
        nodesRef.current.forEach((node) => {
            if (node.metadata?.status !== NODE_STATUS_LOADING || generationRequestsRef.current.has(node.id)) return;
            const kind = resumableTaskKind(node);
            if (kind) resumeGenerationTask(node, kind);
        });
    }, [pendingRetryNonce, projectLoaded, resumableTaskKey, resumeGenerationTask]);

    // 兜底节拍：点击生成后转入等待的节点，其 resumableTaskKey 不会变化（生成时就已是 loading + 任务 ID），
    // 因此每 15 秒触发一次恢复检查；正在轮询的节点会被 resumingRef / generationRequestsRef 跳过。
    useEffect(() => {
        if (!projectLoaded || !resumableTaskKey) return;
        const timer = window.setInterval(triggerPendingRetry, CANVAS_GENERATION_RETRY_DELAY_MS);
        return () => window.clearInterval(timer);
    }, [projectLoaded, resumableTaskKey]);

    // 硬超时：从提交开始计（图片/文本/音频 10 分钟，视频 30 分钟），到点即使轮询还在进行也直接失败。
    // 中止轮询抛出的 AbortError 会被各处 catch 当作"已取消"静默处理，不会把失败状态覆盖回去。
    useEffect(() => {
        if (!projectLoaded) return;
        setNodes((prev) => stampCanvasGenerationStart(prev));
        const expired = nodesRef.current.filter((node) => node.metadata?.status === NODE_STATUS_LOADING && isCanvasGenerationPendingExpired(node));
        if (!expired.length) return;
        console.warn("[canvas-generation] pending timeout reached:", expired.map((node) => node.id).join(","));
        const expiredIds = new Set(expired.map((node) => node.id));
        setNodes((prev) => failCanvasGeneration(prev, expiredIds));
        const controllers = new Set(expired.flatMap((node) => generationRequestsRef.current.get(node.id)?.controller ?? []));
        controllers.forEach((controller) => {
            // 同一批次共用一个 controller：只有共用它的生成中节点全部超时才中止，避免误伤还没到点的兄弟节点。
            const requests = [...generationRequestsRef.current.values()].filter((request) => request.controller === controller);
            const stillWaiting = requests.some((request) => !expiredIds.has(request.targetNodeId) && nodesRef.current.find((node) => node.id === request.targetNodeId)?.metadata?.status === NODE_STATUS_LOADING);
            if (stillWaiting) return;
            requests.forEach((request) => generationRequestsRef.current.delete(request.targetNodeId));
            controller.abort(CANVAS_GENERATION_TIMEOUT_ABORT);
        });
    }, [generationRequestsRef, nodesRef, pendingRetryNonce, projectLoaded, resumableTaskKey, setNodes]);

    useEffect(() => {
        if (!projectLoaded || applyingHistoryRef.current) return;
        const next = createHistoryEntry();
        const previous = lastHistoryRef.current;
        if (
            previous?.nodes === next.nodes &&
            previous.connections === next.connections &&
            previous.chatSessions === next.chatSessions &&
            previous.activeChatId === next.activeChatId &&
            previous.backgroundMode === next.backgroundMode &&
            previous.showImageInfo === next.showImageInfo
        )
            return;

        if (historyCommitTimerRef.current) clearTimeout(historyCommitTimerRef.current);
        historyCommitTimerRef.current = setTimeout(() => {
            const current = createHistoryEntry();
            const last = lastHistoryRef.current;
            if (!last) return;
            historyRef.current.past = [...historyRef.current.past.slice(-49), last];
            historyRef.current.future = [];
            setHistoryState({ canUndo: true, canRedo: false });
            lastHistoryRef.current = current;
            historyCommitTimerRef.current = null;
        }, 180);

        return () => {
            if (historyCommitTimerRef.current) {
                clearTimeout(historyCommitTimerRef.current);
                historyCommitTimerRef.current = null;
            }
        };
    }, [activeChatId, backgroundMode, chatSessions, connections, createHistoryEntry, nodes, projectLoaded, showImageInfo]);

    useEffect(
        () => () => {
            if (agentCloseTimerRef.current) clearTimeout(agentCloseTimerRef.current);
        },
        [],
    );

    useEffect(() => {
        if (!projectLoaded) return;
        if (skipInitialProjectSyncRef.current) {
            skipInitialProjectSyncRef.current = false;
            return;
        }
        updateProject(projectId, { nodes, connections, chatSessions, activeChatId, backgroundMode, showImageInfo });
    }, [activeChatId, backgroundMode, chatSessions, connections, nodes, projectId, projectLoaded, showImageInfo, updateProject]);

    useEffect(() => {
        if (!dialogNodeId) setNodeImageSettingsOpen(false);
    }, [dialogNodeId]);

    useEffect(() => {
        if (!projectLoaded) return;
        if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        viewportSaveTimerRef.current = setTimeout(() => {
            updateProject(projectId, { viewport: viewportRef.current });
            viewportSaveTimerRef.current = null;
        }, 500);
        return () => {
            if (viewportSaveTimerRef.current) clearTimeout(viewportSaveTimerRef.current);
        };
    }, [projectId, projectLoaded, updateProject, viewport]);

    useEffect(() => {
        if (!projectLoaded) return;
        const flushPendingSave = () => {
            updateProject(projectId, {
                nodes: nodesRef.current,
                connections: connectionsRef.current,
                chatSessions,
                activeChatId,
                backgroundMode,
                showImageInfo,
                viewport: viewportRef.current,
            });
            void flushProjectSave(projectId, true);
        };
        const handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") flushPendingSave();
        };
        window.addEventListener("pagehide", flushPendingSave);
        document.addEventListener("visibilitychange", handleVisibilityChange);
        return () => {
            window.removeEventListener("pagehide", flushPendingSave);
            document.removeEventListener("visibilitychange", handleVisibilityChange);
        };
    }, [activeChatId, backgroundMode, chatSessions, flushProjectSave, projectId, projectLoaded, showImageInfo, updateProject]);

    useLayoutEffect(() => {
        nodesRef.current = nodes;
        connectionsRef.current = connections;
        selectedNodeIdsRef.current = selectedNodeIds;
        viewportRef.current = viewport;
        pendingConnectionCreateRef.current = pendingConnectionCreate;
    }, [nodes, connections, selectedNodeIds, viewport, pendingConnectionCreate]);

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        const updateSize = () => {
            const rect = el.getBoundingClientRect();
            setSize({ width: rect.width, height: rect.height });
            if (!didInitialCenterRef.current) {
                didInitialCenterRef.current = true;
                setViewport({ x: rect.width / 2, y: rect.height / 2, k: 1 });
            }
        };

        updateSize();
        const resizeObserver = new ResizeObserver(updateSize);
        resizeObserver.observe(el);
        return () => resizeObserver.disconnect();
    }, []);
}
