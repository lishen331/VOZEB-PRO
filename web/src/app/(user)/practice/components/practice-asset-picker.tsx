"use client";

import { Button, Empty, Modal, Spin } from "antd";
import { Library } from "lucide-react";
import { useState } from "react";

import type { DramaLibraryAssetType } from "@/lib/drama-lab-library-assets";
import { DRAMA_LIBRARY_ASSET_LABELS } from "@/lib/drama-lab-library-assets";
import type { ImageAsset } from "@/lib/library-asset-contract";
import { listLibraryAssetPage } from "@/services/api/library-assets";
import type { UploadedImage } from "@/services/image-storage";

export function libraryAssetToUploadedImage(asset: ImageAsset): UploadedImage {
    return {
        url: asset.data.serverUrl || asset.data.remoteUrl || asset.data.dataUrl,
        storageKey: asset.data.storageKey!,
        width: asset.data.width,
        height: asset.data.height,
        bytes: asset.data.bytes,
        mimeType: asset.data.mimeType,
    };
}

type Props = {
    dramaAssetType?: DramaLibraryAssetType;
    disabled?: boolean;
    onSelect: (image: UploadedImage) => void;
    label?: string;
};

export function PracticeAssetPicker({ dramaAssetType, disabled, onSelect, label }: Props) {
    const [open, setOpen] = useState(false);
    const [assets, setAssets] = useState<ImageAsset[]>([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const openModal = async () => {
        setOpen(true);
        if (loaded) return;
        setLoading(true);
        try {
            const page = await listLibraryAssetPage({ page: 1, pageSize: 48, kind: "image", dramaAssetType });
            setAssets(page.assets.filter((a): a is ImageAsset => a.kind === "image" && Boolean((a as ImageAsset).data.storageKey)));
            setLoaded(true);
        } catch {
            // user will see Empty state
        } finally {
            setLoading(false);
        }
    };

    const categoryLabel = dramaAssetType ? DRAMA_LIBRARY_ASSET_LABELS[dramaAssetType] : "";
    const title = label || (categoryLabel ? `从资产库选（${categoryLabel}）` : "从资产库选择");

    return (
        <>
            <Button size="small" icon={<Library className="size-3.5" />} disabled={disabled} onClick={() => void openModal()}>
                {title}
            </Button>
            <Modal title={title} open={open} onCancel={() => setOpen(false)} footer={null} width={600}>
                {loading ? (
                    <div className="grid place-items-center py-12">
                        <Spin />
                    </div>
                ) : assets.length ? (
                    <div className="max-h-96 overflow-y-auto">
                        <div className="grid grid-cols-4 gap-2 p-1">
                            {assets.map((asset) => (
                                <button
                                    key={asset.id}
                                    type="button"
                                    className="group relative aspect-square overflow-hidden rounded border border-border hover:border-primary focus:outline-none focus:ring-2 focus:ring-primary"
                                    onClick={() => {
                                        onSelect(libraryAssetToUploadedImage(asset));
                                        setOpen(false);
                                    }}
                                >
                                    <img
                                        src={asset.coverUrl || asset.data.serverUrl || asset.data.remoteUrl || asset.data.dataUrl}
                                        alt={asset.title}
                                        className="size-full object-cover"
                                    />
                                    <span className="absolute inset-x-0 bottom-0 truncate bg-black/60 px-1 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100">
                                        {asset.title}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <Empty description={categoryLabel ? `暂无${categoryLabel}素材，请先去资产库上传` : "暂无图片素材，请先去资产库上传"} className="!my-8" />
                )}
                <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                    <a href="/assets" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        前往资产库管理素材 →
                    </a>
                </div>
            </Modal>
        </>
    );
}
