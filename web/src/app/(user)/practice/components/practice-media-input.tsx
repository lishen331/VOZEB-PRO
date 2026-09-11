"use client";

import type { ReactNode } from "react";
import { ImagePlus, Music2, X } from "lucide-react";

export function PracticeMediaInput({ label, accept = "image/*", url, disabled, onChoose, onRemove, children }: { label: string; accept?: string; url?: string; disabled?: boolean; onChoose: (file?: File) => void; onRemove?: () => void; children?: ReactNode }) {
    const audio = accept.startsWith("audio");
    const Icon = audio ? Music2 : ImagePlus;
    return (
        <div className="space-y-2 min-w-0">
            <div className="flex items-center justify-between gap-2 text-sm font-medium">
                <span>{label}</span>
                {url && onRemove ? (
                    <button type="button" aria-label={`移除${label}`} onClick={onRemove} disabled={disabled} className="rounded p-1 text-muted-foreground hover:bg-muted">
                        <X className="size-4" />
                    </button>
                ) : null}
            </div>
            <label
                className={`relative flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed border-border bg-muted/25 p-3 text-center transition hover:border-primary/50 focus-within:ring-2 focus-within:ring-primary ${disabled ? "pointer-events-none opacity-50" : ""}`}
            >
                <input
                    aria-label={label}
                    type="file"
                    accept={accept}
                    disabled={disabled}
                    onChange={(event) => {
                        onChoose(event.target.files?.[0]);
                        event.target.value = "";
                    }}
                    className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
                />
                {url && !audio ? (
                    <img src={url} alt={`已选择的${label}`} className="max-h-44 w-full object-contain" />
                ) : (
                    <>
                        <Icon className="size-6 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{disabled ? "暂不可上传" : url ? "点击替换素材" : "点击上传或拖入素材"}</span>
                    </>
                )}
            </label>
            {url && audio ? <audio controls src={url} className="h-9 w-full" /> : null}
            {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
        </div>
    );
}
