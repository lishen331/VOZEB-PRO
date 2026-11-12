"use client";

import { Modal } from "antd";
import { AlertCircle, ImagePlus, X } from "lucide-react";
import type { DragEvent, KeyboardEvent } from "react";
import { useRef, useState } from "react";

import { VzIconButton, VzTag } from "./primitives";

export type VzUploadItem = { id: string; src: string; name: string; kind?: "image" | "video"; status: "done" | "uploading" | "error"; progress?: number };

type Props = { items: VzUploadItem[]; max?: number; onAdd?: (files: File[]) => void; onRemove?: (id: string) => void; accept?: string; disabled?: boolean; getContainer?: () => HTMLElement };

export function VzUploadZone({ items, max = 6, onAdd, onRemove, accept = "image/*,video/*", disabled = false, getContainer }: Props) {
    const inputRef = useRef<HTMLInputElement>(null);
    const scopeRef = useRef<HTMLDivElement>(null);
    const [dragging, setDragging] = useState(false);
    const [preview, setPreview] = useState<VzUploadItem | null>(null);
    const full = items.length >= max;
    const pick = () => {
        if (!disabled && !full) inputRef.current?.click();
    };
    const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
        if (event.target !== event.currentTarget || disabled) return;
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            pick();
        }
    };
    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setDragging(false);
        if (!disabled && !full) onAdd?.(Array.from(event.dataTransfer.files));
    };

    return (
        <div className="vz-stack" ref={scopeRef}>
            {!full ? (
                <div
                    className="vz-upload"
                    role="button"
                    tabIndex={disabled ? -1 : 0}
                    aria-label="上传参考素材"
                    aria-disabled={disabled || undefined}
                    data-dragging={dragging || undefined}
                    onClick={pick}
                    onKeyDown={onKey}
                    onDragOver={(event) => {
                        event.preventDefault();
                        if (!disabled) setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                >
                    <span className="vz-upload__icon">
                        <ImagePlus aria-hidden />
                    </span>
                    <span className="vz-h3">{dragging ? "松开即可添加" : "拖入或点击添加参考素材"}</span>
                    <span className="vz-caption">
                        仅本地预览，不上传服务器 · {items.length}/{max}
                    </span>
                </div>
            ) : (
                <div className="vz-alert" data-tone="warning" role="status">
                    <AlertCircle aria-hidden />
                    <span>已达到 {max} 个上限，移除后可继续添加。</span>
                </div>
            )}
            <input
                ref={inputRef}
                type="file"
                aria-label="选择参考素材文件"
                hidden
                multiple
                accept={accept}
                disabled={disabled || full}
                onChange={(event) => {
                    const files = Array.from(event.currentTarget.files ?? []);
                    event.currentTarget.value = "";
                    if (files.length) onAdd?.(files);
                }}
            />
            {items.length ? (
                <div className="vz-thumbs">
                    {items.map((item) => (
                        <div key={item.id} className="vz-thumb" data-status={item.status} title={item.name}>
                            <button type="button" className="vz-thumb__preview" aria-label={`预览 ${item.name}`} onClick={() => setPreview(item)}>
                                {item.kind === "video" ? (
                                    <video src={item.src} preload="metadata" muted aria-label={item.name} />
                                ) : (
                                    <>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={item.src} alt={item.name} />
                                    </>
                                )}
                            </button>
                            {onRemove ? (
                                <div className="vz-thumb__remove">
                                    <VzIconButton
                                        icon={X}
                                        label={`移除 ${item.name}`}
                                        size="sm"
                                        disabled={disabled}
                                        onClick={() => {
                                            if (preview?.id === item.id) setPreview(null);
                                            onRemove(item.id);
                                        }}
                                    />
                                </div>
                            ) : null}
                            {item.status !== "done" ? <div className="vz-thumb__badge">{item.status === "uploading" ? <VzTag tone="brand">状态示例 {item.progress ?? 0}%</VzTag> : <VzTag tone="danger">失败示例</VzTag>}</div> : null}
                        </div>
                    ))}
                </div>
            ) : null}
            <Modal
                open={Boolean(preview)}
                title={preview?.name ?? "参考素材预览"}
                footer={null}
                centered
                width={900}
                onCancel={() => setPreview(null)}
                getContainer={getContainer ?? (() => scopeRef.current!.closest<HTMLElement>(".vz-ds")!)}
                destroyOnHidden
            >
                {preview?.kind === "video" ? (
                    <video src={preview.src} controls playsInline className="vz-upload-preview" />
                ) : preview ? (
                    <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={preview.src} alt={preview.name} className="vz-upload-preview" />
                    </>
                ) : null}
            </Modal>
        </div>
    );
}
