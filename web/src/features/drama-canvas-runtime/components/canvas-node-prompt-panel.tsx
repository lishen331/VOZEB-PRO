"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { FileText, Image as ImageIcon, Maximize2, Minimize2, Music2, Square, Video, X } from "lucide-react";
import { Button, Modal, Tooltip } from "antd";

import { ModelPicker } from "@/components/model-picker";
import { CreditSymbol, formatCreditAmount, requestCreditCost } from "@/constant/credits";
import { defaultConfig, useConfigStore, useEffectiveConfig, type AiConfig } from "@/stores/use-config-store";
import { canvasThemes } from "@/lib/canvas-theme";
import { useCanvasColorTheme } from "@/stores/use-theme-store";
import { CanvasImageSettingsPopover } from "./canvas-image-settings-popover";
import { CanvasImageReferenceRolesPopover } from "@/components/canvas-image-reference-roles-popover";
import { CanvasPromptLibrary } from "./canvas-prompt-library";
import { CanvasAudioSettingsPopover } from "./canvas-audio-settings-popover";
import { CanvasResourceMentionTextarea } from "./canvas-resource-mention-textarea";
import { CanvasVideoSettingsPopover } from "./canvas-video-settings-popover";
import { CanvasCameraControl } from "./canvas-camera-control";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { CanvasNodeType, isCanvasImageNodeType, type CanvasGenerationMode, type CanvasNodeData } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { buildCanvasNodeConfig, canvasAudioConfigPatch, canvasImageConfigPatch, canvasVideoConfigPatch } from "../utils/canvas-node-config";
import { canvasModelConfigPatch } from "../utils/canvas-model-capabilities";
import { PANORAMA_IMAGE_SIZE } from "../utils/canvas-panorama";

export type CanvasNodeGenerationMode = CanvasGenerationMode;

const stopCanvasInteraction = (event: SyntheticEvent) => event.stopPropagation();

type CanvasNodePromptPanelProps = {
    node: CanvasNodeData;
    isRunning: boolean;
    onPromptChange: (nodeId: string, prompt: string) => void;
    onConfigChange: (nodeId: string, patch: Partial<CanvasNodeData["metadata"]>) => void;
    onGenerate: (nodeId: string, mode: CanvasNodeGenerationMode, prompt: string) => void;
    onStop: (nodeId: string) => void;
    mentionReferences?: CanvasResourceReference[];
    onImageSettingsOpenChange?: (open: boolean) => void;
    onRemoveReference?: (sourceNodeId: string) => void;
};

export function CanvasNodePromptPanel({ node, isRunning, onPromptChange, onConfigChange, onGenerate, onStop, mentionReferences = [], onImageSettingsOpenChange, onRemoveReference }: CanvasNodePromptPanelProps) {
    const globalConfig = useEffectiveConfig();
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const theme = canvasThemes[useCanvasColorTheme().theme];
    const mode = defaultMode(node.type);
    const config = buildNodeConfig(globalConfig, node, mode);
    const hasTextContent = node.type === CanvasNodeType.Text && Boolean(node.metadata?.content?.trim());
    const hasImageContent = isCanvasImageNodeType(node.type) && Boolean(node.metadata?.content);
    const isPanorama = node.type === CanvasNodeType.Panorama;
    const isEditingExistingContent = hasTextContent || hasImageContent;
    const imageReferenceRoles = mentionReferences.filter((reference) => reference.kind === "image");
    const referenceRoleImages = imageReferenceRoles.length ? imageReferenceRoles : hasImageContent ? [{ nodeId: node.id, kind: "image" as const, label: "\u56fe\u7247 1", title: node.title || "\u5f53\u524d\u56fe\u7247" }] : [];
    const textReferences = mentionReferences.filter((reference) => reference.active && reference.nodeId !== node.id);
    const [prompt, setPrompt] = useState(isEditingExistingContent ? "" : node.metadata?.prompt || "");
    const [expanded, setExpanded] = useState(false);
    const expandedEditorRef = useRef<HTMLTextAreaElement | null>(null);
    const credits = requestCreditCost({
        apiSource: config.apiSource,
        modelPointCosts: config.modelPointCosts,
        generationPointMultipliers: config.generationPointMultipliers,
        kind: mode,
        model: config.model,
        count: mode === "image" ? config.count : 1,
        quality: config.quality,
        videoQuality: config.vquality,
        videoSeconds: config.videoSeconds,
    });

    useEffect(() => {
        setPrompt(isEditingExistingContent ? "" : node.metadata?.prompt || "");
    }, [isEditingExistingContent, node.id]);

    const updatePrompt = (value: string) => {
        setPrompt(value);
        if (!isEditingExistingContent) onPromptChange(node.id, value);
    };

    const submit = () => {
        const text = prompt.trim();
        if (!text || isRunning) return false;
        onGenerate(node.id, mode, text);
        setPrompt("");
        return true;
    };

    const submitExpanded = () => {
        if (submit()) setExpanded(false);
    };

    return (
        <div
            className="flex max-h-full min-h-0 flex-col rounded-2xl border p-3 shadow-2xl backdrop-blur"
            style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onMouseDown={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={(event) => event.stopPropagation()}
        >
            <div className="relative flex min-h-0 flex-1 flex-col rounded-xl border" style={{ background: theme.node.fill, borderColor: theme.node.stroke }}>
                {textReferences.length ? (
                    <div className="flex flex-wrap items-start gap-1.5 px-3 pt-2" aria-label="引用的连接节点">
                        {textReferences.map((reference) => {
                            const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
                            const hasPreview = !!reference.previewUrl;
                            return (
                                <div key={reference.id} data-canvas-resource-reference={reference.nodeId} className="group relative flex w-12 flex-col items-center gap-0.5">
                                    <div className="relative size-12 overflow-hidden rounded-lg border" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
                                        {reference.kind === "image" && hasPreview ? (
                                            <img src={imagePreviewUrl(reference.previewUrl!, 96)} alt="" className="size-full object-cover" />
                                        ) : reference.kind === "video" && hasPreview ? (
                                            <video src={reference.previewUrl} muted playsInline preload="metadata" className="size-full object-cover" />
                                        ) : (
                                            <span className="grid size-full place-items-center" style={{ color: theme.toolbar.item }}>
                                                <Icon className="size-5" aria-hidden />
                                            </span>
                                        )}
                                        {onRemoveReference ? (
                                            <button
                                                type="button"
                                                className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border backdrop-blur"
                                                style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    onRemoveReference(reference.nodeId);
                                                }}
                                                onMouseDown={stopCanvasInteraction}
                                                onPointerDown={stopCanvasInteraction}
                                                aria-label={`取消引用 ${reference.label}`}
                                            >
                                                <X className="size-2.5" aria-hidden />
                                            </button>
                                        ) : null}
                                    </div>
                                    <span className="w-full truncate text-center text-[10px] leading-tight" style={{ color: theme.toolbar.item }}>
                                        {reference.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ) : null}
                <CanvasResourceMentionTextarea
                    autoFocus
                    value={prompt}
                    references={mentionReferences}
                    onChange={updatePrompt}
                    onSubmit={submit}
                    aria-label="节点提示词"
                    data-canvas-prompt-scroll="node"
                    className="thin-scrollbar h-36 max-h-full min-h-16 w-full flex-1 resize-none overflow-y-auto overscroll-contain bg-transparent px-3 py-2 pr-11 text-sm leading-5 outline-none"
                    style={{ color: theme.node.text }}
                    placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent, isPanorama)}
                />
                <Tooltip title="放大提示词输入" placement="top">
                    <button
                        type="button"
                        data-canvas-no-drag
                        className="absolute right-2 top-2 z-10 grid size-8 place-items-center rounded-lg border transition-opacity hover:opacity-75 focus-visible:outline-none focus-visible:ring-2"
                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                        onClick={(event) => {
                            event.stopPropagation();
                            setExpanded(true);
                        }}
                        onMouseDown={stopCanvasInteraction}
                        onPointerDown={stopCanvasInteraction}
                        aria-label="放大提示词输入"
                    >
                        <Maximize2 className="size-4" aria-hidden />
                    </button>
                </Tooltip>
            </div>

            <div className="mt-2 flex min-w-0 shrink-0 flex-wrap items-center gap-2">
                <div className="canvas-composer-tools flex min-w-0 flex-1 flex-wrap items-center gap-2">
                    {mode === "image" ? (
                        <>
                            <ModelPicker
                                className="min-w-[9rem] flex-1"
                                config={config}
                                value={config.model}
                                onChange={(model) => onConfigChange(node.id, canvasModelConfigPatch(config, model, "image"))}
                                capability="image"
                                onMissingConfig={() => openConfigDialog(true)}
                            />
                            <CanvasImageSettingsPopover
                                config={config}
                                placement="topLeft"
                                buttonClassName="canvas-composer-settings !h-10 !min-w-[9rem] !max-w-full !flex-1 !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, canvasImageConfigPatch(key, value))}
                                onOpenChange={onImageSettingsOpenChange}
                                fixedSizeLabel={isPanorama ? "全景 2:1" : undefined}
                            />
                            <div className="ml-auto flex shrink-0 items-center gap-1">
                                <CanvasPromptLibrary onSelect={updatePrompt} />
                                {referenceRoleImages.length ? (
                                    <CanvasImageReferenceRolesPopover references={referenceRoleImages} roles={node.metadata?.imageReferenceRoles} onChange={(imageReferenceRoles) => onConfigChange(node.id, { imageReferenceRoles })} iconOnly />
                                ) : null}
                                {!isPanorama ? <CanvasCameraControl value={node.metadata?.cameraControl} onChange={(cameraControl) => onConfigChange(node.id, { cameraControl })} iconOnly /> : null}
                            </div>
                        </>
                    ) : mode === "video" ? (
                        <>
                            <ModelPicker
                                className="min-w-[9rem] flex-1"
                                config={config}
                                value={config.model}
                                onChange={(model) => onConfigChange(node.id, canvasModelConfigPatch(config, model, "video"))}
                                capability="video"
                                onMissingConfig={() => openConfigDialog(true)}
                            />
                            <CanvasVideoSettingsPopover
                                config={config}
                                metadata={node.metadata}
                                references={mentionReferences}
                                buttonClassName="canvas-composer-settings !h-10 !min-w-[9rem] !max-w-full !flex-1 !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, canvasVideoConfigPatch(key, value))}
                                onMetadataChange={(patch) => onConfigChange(node.id, patch)}
                            />
                            <div className="ml-auto flex shrink-0 items-center gap-1">
                                <CanvasPromptLibrary onSelect={updatePrompt} />
                                <CanvasCameraControl value={node.metadata?.cameraControl} onChange={(cameraControl) => onConfigChange(node.id, { cameraControl })} iconOnly />
                            </div>
                        </>
                    ) : mode === "audio" ? (
                        <>
                            <ModelPicker className="min-w-[9rem] flex-1" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="audio" onMissingConfig={() => openConfigDialog(true)} />
                            <CanvasAudioSettingsPopover
                                config={config}
                                buttonClassName="canvas-composer-settings !h-10 !min-w-[9rem] !max-w-full !flex-1 !justify-start !rounded-full !px-3"
                                onConfigChange={(key, value) => onConfigChange(node.id, canvasAudioConfigPatch(key, value))}
                            />
                            <div className="ml-auto flex shrink-0 items-center gap-1">
                                <CanvasPromptLibrary onSelect={updatePrompt} />
                            </div>
                        </>
                    ) : (
                        <>
                            <ModelPicker className="min-w-[9rem] flex-1" config={config} value={config.model} onChange={(model) => onConfigChange(node.id, { model })} capability="text" onMissingConfig={() => openConfigDialog(true)} />
                            <div className="ml-auto flex shrink-0 items-center gap-1">
                                <CanvasPromptLibrary onSelect={updatePrompt} />
                            </div>
                        </>
                    )}
                </div>
                <Button
                    type="primary"
                    className="canvas-generate-button canvas-metal-button !h-10 !min-w-16 shrink-0 !rounded-full !px-3"
                    data-generating={isRunning ? "true" : undefined}
                    disabled={!isRunning && !prompt.trim()}
                    onClick={() => (isRunning ? onStop(node.id) : submit())}
                    aria-label={isRunning ? "停止生成" : "生成"}
                >
                    <span className="relative flex items-center gap-1.5">
                        {isRunning ? (
                            <>
                                <Square className="size-3.5 fill-current" />
                                <span className="text-xs font-medium">停止</span>
                            </>
                        ) : (
                            <>
                                <span className="text-xs font-semibold">生成</span>
                                <span className="inline-flex items-center gap-1 text-xs font-medium tabular-nums">
                                    <CreditSymbol />
                                    {formatCreditAmount(credits)}
                                </span>
                            </>
                        )}
                    </span>
                </Button>
            </div>

            <div className="contents" onClick={stopCanvasInteraction} onDoubleClick={stopCanvasInteraction} onMouseDown={stopCanvasInteraction} onPointerDown={stopCanvasInteraction} onWheel={stopCanvasInteraction} onContextMenu={stopCanvasInteraction}>
                <Modal
                    className="canvas-prompt-editor-modal"
                    open={expanded}
                    title="编辑提示词"
                    centered
                    destroyOnHidden
                    mask={{ closable: false }}
                    width="min(760px, calc(100vw - 24px))"
                    onCancel={() => setExpanded(false)}
                    afterOpenChange={(open) => {
                        if (!open) return;
                        requestAnimationFrame(() => {
                            const textarea = expandedEditorRef.current;
                            textarea?.focus();
                            textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
                        });
                    }}
                    styles={{
                        container: { background: theme.node.panel, border: `1px solid ${theme.toolbar.border}`, color: theme.node.text },
                        header: { background: theme.node.panel, marginBottom: 0, paddingBottom: 8 },
                        title: { color: theme.node.text },
                        body: { background: theme.node.panel, padding: "4px 12px 12px" },
                    }}
                    footer={null}
                >
                    <div data-canvas-prompt-editor="expanded" className="min-w-0 overflow-hidden rounded-xl border" style={{ borderColor: theme.node.stroke, background: theme.node.fill }}>
                        {textReferences.length ? (
                            <div className="flex flex-wrap items-start gap-2 px-4 pt-3" aria-label="引用的连接节点">
                                {textReferences.map((reference) => {
                                    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
                                    const hasPreview = !!reference.previewUrl;
                                    return (
                                        <div key={reference.id} data-canvas-resource-reference={reference.nodeId} className="group relative flex w-12 flex-col items-center gap-0.5">
                                            <div className="relative size-12 overflow-hidden rounded-lg border" style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border }}>
                                                {reference.kind === "image" && hasPreview ? (
                                                    <img src={imagePreviewUrl(reference.previewUrl!, 96)} alt="" className="size-full object-cover" />
                                                ) : reference.kind === "video" && hasPreview ? (
                                                    <video src={reference.previewUrl} muted playsInline preload="metadata" className="size-full object-cover" />
                                                ) : (
                                                    <span className="grid size-full place-items-center" style={{ color: theme.toolbar.item }}>
                                                        <Icon className="size-5" aria-hidden />
                                                    </span>
                                                )}
                                                {onRemoveReference ? (
                                                    <button
                                                        type="button"
                                                        className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border backdrop-blur"
                                                        style={{ background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.toolbar.item }}
                                                        onClick={(event) => {
                                                            event.stopPropagation();
                                                            onRemoveReference(reference.nodeId);
                                                        }}
                                                        onMouseDown={stopCanvasInteraction}
                                                        onPointerDown={stopCanvasInteraction}
                                                        aria-label={`取消引用 ${reference.label}`}
                                                    >
                                                        <X className="size-2.5" aria-hidden />
                                                    </button>
                                                ) : null}
                                            </div>
                                            <span className="w-full truncate text-center text-[10px] leading-tight" style={{ color: theme.toolbar.item }}>
                                                {reference.label}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : null}
                        <CanvasResourceMentionTextarea
                            ref={expandedEditorRef}
                            autoFocus={expanded}
                            value={prompt}
                            references={mentionReferences}
                            onChange={updatePrompt}
                            onSubmit={submitExpanded}
                            aria-label="提示词编辑器"
                            data-canvas-prompt-scroll="expanded"
                            className="thin-scrollbar h-[min(52vh,26rem)] min-h-64 w-full resize-none overflow-y-auto overscroll-contain border-0 bg-transparent px-4 py-3 text-sm leading-6 outline-none"
                            style={{ color: theme.node.text }}
                            placeholder={promptPlaceholder(mode, hasImageContent, hasTextContent, isPanorama)}
                        />
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                        <Button icon={<Minimize2 className="size-4" />} onClick={() => setExpanded(false)} aria-label="收起提示词输入">
                            收起
                        </Button>
                        <Button type="primary" danger={isRunning} disabled={!isRunning && !prompt.trim()} onClick={() => (isRunning ? onStop(node.id) : submitExpanded())} aria-label={isRunning ? "停止生成" : "生成"}>
                            {isRunning ? "停止生成" : "生成"}
                        </Button>
                    </div>
                </Modal>
            </div>
        </div>
    );
}

function defaultMode(type: CanvasNodeData["type"]): CanvasNodeGenerationMode {
    return type === CanvasNodeType.Text ? "text" : type === CanvasNodeType.Video ? "video" : type === CanvasNodeType.Audio ? "audio" : "image";
}

function buildNodeConfig(globalConfig: AiConfig, node: CanvasNodeData, mode: CanvasNodeGenerationMode): AiConfig {
    const defaultModel = mode === "image" ? globalConfig.imageModel : mode === "video" ? globalConfig.videoModel : mode === "audio" ? globalConfig.audioModel : globalConfig.textModel;
    const model = node.metadata?.model || defaultModel || (mode === "audio" ? defaultConfig.audioModel : globalConfig.model || defaultConfig.model);
    const config = buildCanvasNodeConfig(globalConfig, node, mode, model);
    return node.type === CanvasNodeType.Panorama ? { ...config, size: PANORAMA_IMAGE_SIZE } : config;
}

function promptPlaceholder(mode: CanvasNodeGenerationMode, hasImageContent: boolean, hasTextContent: boolean, isPanorama: boolean) {
    if (mode === "video") return "描述要生成的视频内容";
    if (mode === "audio") return "描述要生成的音频内容";
    if (isPanorama) return hasImageContent ? "描述要如何调整这个全景环境" : "描述要生成的 360° 全景环境";
    if (mode === "image") return hasImageContent ? "请输入你想要把这张图修改成什么" : "描述要生成的图片内容";
    return hasTextContent ? "请输入你想要将本段文本修改成什么" : "请输入你想要生成的文本内容";
}
