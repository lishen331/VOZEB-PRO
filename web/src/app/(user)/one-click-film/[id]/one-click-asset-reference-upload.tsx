"use client";
import { Button } from "antd";
import { ImageIcon } from "lucide-react";
import { useRef } from "react";
import type { DramaAssetReference } from "@/lib/drama-project-contract";

/** L's ref-image-zone: image is the upload target, actions are outside it. */
export function OneClickAssetReferenceUpload({ reference, busy, onUpload, onExtract, onRemove }: { reference?: DramaAssetReference; busy: boolean; onUpload: (files: FileList) => void; onExtract: () => void; onRemove: () => void }) {
    const input = useRef<HTMLInputElement>(null);
    return (
        <div className="flex flex-wrap items-start gap-3" data-testid="asset-reference-upload">
            <button
                type="button"
                className="flex h-36 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border-2 border-dashed border-border bg-muted/40 hover:border-primary disabled:opacity-50"
                aria-label="上传参考图"
                disabled={busy}
                onClick={() => input.current?.click()}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                    event.preventDefault();
                    if (!busy && event.dataTransfer.files.length) onUpload(event.dataTransfer.files);
                }}
            >
                {reference ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={reference.url} alt="参考图预览" className="h-full w-full object-contain" />
                ) : (
                    <span className="flex flex-col items-center gap-2 text-xs text-muted-foreground">
                        <ImageIcon className="size-6" />
                        点击或拖入参考图
                    </span>
                )}
            </button>
            {/* Sibling, not a child of the clickable upload box: selecting/cancelling never reopens the picker. */}
            <input
                ref={input}
                type="file"
                accept="image/*"
                multiple
                hidden
                aria-label="参考图文件"
                disabled={busy}
                onChange={(event) => {
                    if (event.target.files?.length) onUpload(event.target.files);
                    event.target.value = "";
                }}
            />
            {reference ? (
                <div className="flex flex-col items-start gap-2">
                    <Button type="primary" size="small" disabled={busy} onClick={onExtract}>
                        从参考图提取描述
                    </Button>
                    <Button size="small" disabled={busy} onClick={onRemove}>
                        移除参考图
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
