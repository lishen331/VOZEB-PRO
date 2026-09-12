"use client";

import { Button, Empty, Image, Input, Modal, Pagination, Spin } from "antd";
import { useEffect, useRef, useState } from "react";

import type { Asset } from "@/lib/library-asset-contract";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { listLibraryAssetPage } from "@/services/api/library-assets";
import { type VisualAssetKind } from "./drama-lab-asset-library-pager";

type PickerProps = {
    kind: VisualAssetKind;
    label: string;
    busyKey: string;
    importedNames?: string[];
    onClose: () => void;
    onImport: (asset: Asset) => Promise<boolean>;
};

export function DramaLabAssetLibraryPicker(props: PickerProps) {
    return <AssetLibraryPickerSession key={props.kind} {...props} />;
}

function AssetLibraryPickerSession({ label, busyKey, importedNames = [], onClose, onImport }: PickerProps) {
    const [keyword, setKeyword] = useState("");
    const [assets, setAssets] = useState<Asset[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [importedIds, setImportedIds] = useState<Set<string>>(new Set());
    const composing = useRef(false);

    useEffect(() => {
        setPage(1);
        setKeyword("");
        setImportedIds(new Set());
    }, [label]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(
            async () => {
                setLoading(true);
                setError("");
                try {
                    const result = await listLibraryAssetPage({ page, pageSize, kind: "image", keyword }, controller.signal);
                    setAssets(result.assets);
                    setTotal(result.total);
                } catch (loadError) {
                    if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "素材库加载失败");
                } finally {
                    if (!controller.signal.aborted) setLoading(false);
                }
            },
            keyword ? 250 : 0,
        );
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [keyword, page, pageSize]);

    const importedNameSet = new Set(importedNames.map((name) => name.trim()).filter(Boolean));

    return (
        <Modal
            title={`从素材库导入${label}`}
            open
            width={720}
            destroyOnHidden
            onCancel={onClose}
            footer={
                <div className="flex justify-end">
                    <Button onClick={onClose}>关闭</Button>
                </div>
            }
        >
            <div className="space-y-3">
                <div className="flex items-center gap-3">
                    <Input
                        allowClear
                        placeholder="搜索关键词"
                        value={keyword}
                        onCompositionStart={() => {
                            composing.current = true;
                        }}
                        onCompositionEnd={(event) => {
                            composing.current = false;
                            setKeyword(event.currentTarget.value);
                            setPage(1);
                        }}
                        onChange={(event) => {
                            setKeyword(event.target.value);
                            if (!composing.current) setPage(1);
                        }}
                    />
                    <span className="shrink-0 text-sm text-muted-foreground">点击“导入”将素材复制到本剧资源库</span>
                </div>
                <div className="max-h-[58dvh] min-h-36 overflow-y-auto overscroll-contain pr-1" aria-label="素材库导入列表" aria-busy={loading}>
                    {loading ? (
                        <div className="flex min-h-36 items-center justify-center">
                            <Spin />
                        </div>
                    ) : error ? (
                        <div role="alert" className="py-8 text-center text-sm text-destructive">
                            {error}
                        </div>
                    ) : assets.length ? (
                        <div className="space-y-2">
                            {assets.map((asset) => {
                                const url = asset.kind === "image" ? asset.data.serverUrl || asset.data.remoteUrl || asset.data.dataUrl || asset.coverUrl : asset.coverUrl;
                                const imported = importedIds.has(asset.id) || importedNameSet.has(asset.title.trim());
                                return (
                                    <div key={asset.id} className="flex min-h-20 items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
                                        <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded border border-border bg-muted/40">
                                            {url ? <Image preview={{ src: imagePreviewUrl(url, 1920) }} src={imagePreviewUrl(url, 160)} alt="" className="!size-full !object-cover" /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={false} />}
                                        </div>
                                        <span className="min-w-0 flex-1 truncate text-sm font-medium" title={asset.title}>
                                            {asset.title}
                                        </span>
                                        <Button
                                            size="small"
                                            type={imported ? "default" : "primary"}
                                            loading={busyKey === `library:${asset.id}`}
                                            disabled={Boolean(busyKey) || imported}
                                            onClick={async () => {
                                                if (await onImport(asset)) setImportedIds((current) => new Set(current).add(asset.id));
                                            }}
                                        >
                                            {imported ? "已导入" : "导入"}
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={keyword.trim() ? "没有匹配的图片素材" : "素材库暂无图片素材"} />
                    )}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
                    <span className="text-sm text-muted-foreground">共 {total} 条</span>
                    <Pagination
                        current={page}
                        pageSize={pageSize}
                        total={total}
                        showSizeChanger
                        pageSizeOptions={[10, 20, 50]}
                        showLessItems
                        onChange={(nextPage, nextPageSize) => {
                            setPage(nextPage);
                            setPageSize(nextPageSize);
                        }}
                        showTotal={() => null}
                    />
                </div>
            </div>
        </Modal>
    );
}
