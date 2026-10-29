"use client";

import { Button } from "@/components/gamma-ui/gamma-ant";
import { Popover } from "@/components/gamma-ui/gamma-ant-overlay";
import { ArrowLeftRight, ImagePlus, Upload, X } from "lucide-react";
import { useState } from "react";

import type { CreativeAsset } from "@/lib/creative-runtime-contract";
import { imagePreviewUrl } from "@/lib/media-image-url";
import type { CreativeVideoReferenceMode, VideoReferenceRole } from "@/lib/video-reference-contract";
import { cn } from "@/lib/utils";

type FrameRole = Extract<VideoReferenceRole, "first_frame" | "last_frame">;
type FramePopoverPlacement = "topLeft" | "topRight" | "bottomLeft" | "bottomRight";

export function CreativeVideoFrameControls({
    mode,
    images,
    firstFrameAssetId,
    lastFrameAssetId,
    uploading,
    placement,
    onSelect,
    onUpload,
    onRemove,
}: {
    mode: CreativeVideoReferenceMode;
    images: CreativeAsset[];
    firstFrameAssetId?: string;
    lastFrameAssetId?: string;
    uploading: boolean;
    placement: "topLeft" | "bottomLeft";
    onSelect: (role: FrameRole, assetId: string) => void;
    onUpload: (role: FrameRole) => void;
    onRemove: (role: FrameRole) => void;
}) {
    if (mode === "reference") return null;
    return (
        <div className="flex shrink-0 items-start gap-1" aria-label={mode === "first_last" ? "视频首尾帧" : "视频首帧"}>
            <FrameSlot role="first_frame" label="首帧" assetId={firstFrameAssetId} images={images} uploading={uploading} placement={placement === "bottomLeft" ? "bottomLeft" : "topLeft"} onSelect={onSelect} onUpload={onUpload} onRemove={onRemove} />
            {mode === "first_last" ? (
                <>
                    <ArrowLeftRight className="mt-7 size-3.5 shrink-0 text-[var(--gm-text-3)]" aria-hidden="true" />
                    <FrameSlot
                        role="last_frame"
                        label="尾帧"
                        assetId={lastFrameAssetId}
                        images={images}
                        uploading={uploading}
                        placement={placement === "bottomLeft" ? "bottomRight" : "topRight"}
                        onSelect={onSelect}
                        onUpload={onUpload}
                        onRemove={onRemove}
                    />
                </>
            ) : null}
        </div>
    );
}

function FrameSlot({
    role,
    label,
    assetId,
    images,
    uploading,
    placement,
    onSelect,
    onUpload,
    onRemove,
}: {
    role: FrameRole;
    label: string;
    assetId?: string;
    images: CreativeAsset[];
    uploading: boolean;
    placement: FramePopoverPlacement;
    onSelect: (role: FrameRole, assetId: string) => void;
    onUpload: (role: FrameRole) => void;
    onRemove: (role: FrameRole) => void;
}) {
    const [open, setOpen] = useState(false);
    const asset = images.find((item) => item.id === assetId);
    const url = assetUrl(asset);
    return (
        <div className="relative h-16 w-14 shrink-0">
            <Popover
                trigger="click"
                placement={placement}
                arrow={false}
                destroyOnHidden
                open={open}
                onOpenChange={setOpen}
                content={
                    <div className="w-64 max-w-[calc(100vw-40px)] py-0.5 sm:w-80">
                        <p className="px-1 pb-2 text-xs font-semibold text-[var(--gm-text)]">选择{label}图片</p>
                        <div className="hide-scrollbar grid max-h-52 grid-cols-3 gap-1.5 overflow-y-auto">
                            {images.map((item) => {
                                const itemUrl = assetUrl(item);
                                const selected = item.id === assetId;
                                return (
                                    <button
                                        key={item.id}
                                        type="button"
                                        disabled={!itemUrl}
                                        className={cn(
                                            "relative aspect-square min-w-0 overflow-hidden rounded-lg border bg-[var(--gm-wash-strong)] transition disabled:opacity-40",
                                            selected ? "border-[var(--gm-accent)] ring-2 ring-[var(--gm-accent-ring)]" : "border-[var(--gm-border)] hover:border-[var(--gm-border-strong)]",
                                        )}
                                        onClick={() => {
                                            onSelect(role, item.id);
                                            setOpen(false);
                                        }}
                                        aria-label={`设为${label}：${item.title}`}
                                    >
                                        {itemUrl ? <img src={imagePreviewUrl(itemUrl, 320)} alt="" className="size-full object-cover" /> : <ImagePlus className="absolute inset-0 m-auto size-4 text-[var(--gm-text-3)]" />}
                                    </button>
                                );
                            })}
                        </div>
                        {!images.length ? <p className="py-4 text-center text-xs text-[var(--gm-text-3)]">本轮还没有图片素材</p> : null}
                        <Button
                            type="text"
                            block
                            size="small"
                            className="mt-2 !justify-start"
                            icon={<Upload className="size-3.5" />}
                            loading={uploading}
                            onClick={() => {
                                setOpen(false);
                                onUpload(role);
                            }}
                        >
                            上传新图片
                        </Button>
                    </div>
                }
            >
                <button
                    type="button"
                    className={cn(
                        "relative grid size-14 place-items-center overflow-hidden rounded-lg border border-[var(--gm-border)] bg-[var(--gm-wash-strong)] text-[var(--gm-text-3)] shadow-[0_2px_8px_rgba(38,49,65,0.08)] transition hover:border-[var(--gm-border-strong)] hover:text-[var(--gm-text)]",
                        role === "first_frame" ? "rotate-[-3deg]" : "rotate-[3deg]",
                    )}
                    aria-label={asset ? `更换视频${label}` : `添加视频${label}`}
                >
                    {url ? (
                        <img src={imagePreviewUrl(url, 320)} alt={asset?.title || label} className="size-full object-cover" />
                    ) : (
                        <span className="grid size-full place-items-center bg-[var(--gm-wash-strong)]">
                            <ImagePlus className="size-5" />
                        </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-black/45 px-1 py-0.5 text-center text-[9px] font-medium text-white">{asset ? label : `添加${label}`}</span>
                </button>
            </Popover>
            {asset ? (
                <button
                    type="button"
                    className="absolute -right-1 -top-1 z-10 grid size-5 place-items-center rounded-full border border-[var(--gm-surface)] bg-black/60 text-white transition hover:bg-black/80"
                    onClick={() => onRemove(role)}
                    aria-label={`移除视频${label}`}
                >
                    <X className="size-3.5" />
                </button>
            ) : null}
        </div>
    );
}

function assetUrl(asset: CreativeAsset | undefined) {
    return asset?.serverUrl || asset?.remoteUrl || "";
}
