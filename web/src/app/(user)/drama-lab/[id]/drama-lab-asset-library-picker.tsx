"use client";
import { Button, Input, List, Modal } from "antd";
import { Images } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { Asset } from "@/lib/library-asset-contract";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { listLibraryAssetPage } from "@/services/api/library-assets";
import { createAssetLibraryPager, type VisualAssetKind } from "./drama-lab-asset-library-pager";
type PickerProps = { kind: VisualAssetKind; label: string; busyKey: string; onClose: () => void; onImport: (asset: Asset) => Promise<void> };

export function DramaLabAssetLibraryPicker(props: PickerProps) {
    return <AssetLibraryPickerSession key={props.kind} {...props} />;
}

function AssetLibraryPickerSession({ kind, label, busyKey, onClose, onImport }: PickerProps) {
    const [keyword, setKeyword] = useState("");
    const composing = useRef(false);
    const [pager] = useState(() => createAssetLibraryPager(listLibraryAssetPage));
    const state = useSyncExternalStore(pager.subscribe, pager.getSnapshot, pager.getSnapshot);
    useEffect(() => {
        void pager.reset(kind, "");
        return () => pager.dispose();
    }, [kind, pager]);
    return (
        <Modal title={`从素材库添加${label}`} open footer={null} onCancel={onClose} width={720}>
            <Input
                className="mb-3"
                allowClear
                placeholder="搜索图片素材"
                value={keyword}
                onCompositionStart={() => {
                    composing.current = true;
                }}
                onCompositionEnd={(event) => {
                    composing.current = false;
                    setKeyword(event.currentTarget.value);
                    void pager.reset(kind, event.currentTarget.value);
                }}
                onChange={(event) => {
                    setKeyword(event.target.value);
                    if (!composing.current) void pager.reset(kind, event.target.value);
                }}
            />
            <div className="max-h-[60dvh] min-h-0 overflow-y-auto overscroll-contain" aria-label="素材库搜索结果" aria-busy={state.loading}>
                <List
                    loading={state.loading}
                    rowKey="id"
                    dataSource={state.assets}
                    locale={{ emptyText: state.loading ? "正在加载素材…" : state.error ? "素材加载失败，请重试" : keyword.trim() ? "没有匹配的图片素材" : "素材库暂无图片素材" }}
                    renderItem={(asset) => {
                        const imageAsset = asset.kind === "image" ? asset : undefined;
                        const url = imageAsset?.data.serverUrl || imageAsset?.data.remoteUrl || imageAsset?.data.dataUrl || asset.coverUrl;
                        return (
                            <List.Item
                                actions={[
                                    <Button key="add" type="link" loading={busyKey === `library:${asset.id}`} disabled={Boolean(busyKey)} onClick={() => void onImport(asset)}>
                                        添加
                                    </Button>,
                                ]}
                            >
                                <List.Item.Meta
                                    avatar={url ? <img src={imagePreviewUrl(url, 96)} alt="" className="size-10 rounded object-cover" /> : <Images className="size-5 text-muted-foreground" />}
                                    title={<span className="break-words">{asset.title}</span>}
                                    description={<span className="break-words">{asset.note || asset.tags.join("、") || "图片素材"}</span>}
                                />
                            </List.Item>
                        );
                    }}
                />
                {state.error ? (
                    <div role="alert" className="py-2 text-sm text-destructive">
                        {state.error}
                    </div>
                ) : null}
                {state.hasMore ? (
                    <Button block loading={state.loading} onClick={() => void pager.loadMore()}>
                        {state.error ? "重试加载" : "加载更多"}
                    </Button>
                ) : state.assets.length ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">已加载全部 {state.assets.length} 项</p>
                ) : null}
            </div>
        </Modal>
    );
}
