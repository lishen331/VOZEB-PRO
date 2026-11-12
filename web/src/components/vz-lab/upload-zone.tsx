"use client";

import { ImagePlus, X } from "lucide-react";
import type { DragEvent } from "react";
import { useRef, useState } from "react";

import { LabAlert } from "./feedback";
import { LabIconButton, LabTag } from "./primitives";

export type LabUploadItem = { id: string; src: string; name: string; status: "done" | "uploading" | "error"; progress?: number };

export function LabUploadZone({ items, max = 6, onAdd, onRemove }: { items: LabUploadItem[]; max?: number; onAdd?: (files: File[]) => void; onRemove?: (id: string) => void }) {
    const input = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);
    const full = items.length >= max;

    const onDrop = (event: DragEvent<HTMLButtonElement>) => {
        event.preventDefault();
        setDragging(false);
        onAdd?.(Array.from(event.dataTransfer.files));
    };

    return (
        <div className="vzl-stack">
            {full ? (
                <LabAlert tone="warning">{`已达到 ${max} 个上限，移除后可继续添加。`}</LabAlert>
            ) : (
                <button
                    type="button"
                    className="vzl-upload"
                    data-dragging={dragging || undefined}
                    onClick={() => input.current?.click()}
                    onDragOver={(event) => {
                        event.preventDefault();
                        setDragging(true);
                    }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={onDrop}
                >
                    <span className="vzl-upload__icon">
                        <ImagePlus aria-hidden />
                    </span>
                    <span className="vzl-h3">{dragging ? "松开即可添加" : "拖入或点击添加参考素材"}</span>
                    <span className="vzl-caption">{`JPG / PNG / WEBP / MP4，单个不超过 20MB · ${items.length}/${max}`}</span>
                </button>
            )}
            <input
                ref={input}
                type="file"
                hidden
                multiple
                accept="image/*,video/*"
                onChange={(event) => {
                    onAdd?.(Array.from(event.target.files ?? []));
                    event.target.value = "";
                }}
            />
            {items.length ? (
                <ul className="vzl-thumbs" aria-label="已添加的参考素材" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {items.map((item) => (
                        <li key={item.id} className="vzl-thumb" data-status={item.status} title={item.name}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={item.src} alt={item.name} />
                            <LabIconButton icon={X} label={`移除 ${item.name}`} size="sm" className="vzl-thumb__remove vzl-on-media" onClick={() => onRemove?.(item.id)} />
                            {item.status !== "done" ? <div className="vzl-thumb__badge">{item.status === "uploading" ? <LabTag tone="brand" className="vzl-num">{`${item.progress ?? 0}%`}</LabTag> : <LabTag tone="danger">失败</LabTag>}</div> : null}
                        </li>
                    ))}
                </ul>
            ) : null}
        </div>
    );
}
