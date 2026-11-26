"use client";

import { imagePreviewUrl } from "@/lib/media-image-url";
import { Modal } from "@/components/gamma-ui/gamma-ant-modal";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Button, Empty, Pagination, Segmented } from "@/components/gamma-ui/gamma-ant";
import { useEffect, useState } from "react";
import { listOfficialWorkMedia, type OfficialWorkMedia, type WorkPublicationMediaType } from "@/services/api/work-publications";

const PAGE_SIZE = 12;
type MediaBrowserProps = { selected: string[]; imagesAndVideosOnly?: boolean } & ({ onSelect: (asset: OfficialWorkMedia) => void; onAdd?: never } | { onAdd: (assets: OfficialWorkMedia[]) => void; onSelect?: never });

export function AdminOfficialWorkMediaPicker({ open, onClose, ...props }: { open: boolean; onClose: () => void } & MediaBrowserProps) {
    return (
        <Modal open={open} width="min(760px, 100vw)" title="选择已有永久媒体" footer={null} onCancel={onClose}>
            {open ? <AdminOfficialWorkMediaBrowser {...props} /> : null}
        </Modal>
    );
}

function AdminOfficialWorkMediaBrowser({ selected, imagesAndVideosOnly, onSelect, onAdd }: MediaBrowserProps) {
    const [type, setType] = useState<WorkPublicationMediaType>("image");
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<OfficialWorkMedia[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [retry, setRetry] = useState(0);
    const [pending, setPending] = useState<OfficialWorkMedia[]>([]);

    useEffect(() => {
        let current = true;
        setLoading(true);
        setError("");
        void listOfficialWorkMedia({ page, pageSize: PAGE_SIZE, type, keyword: keyword || undefined })
            .then((result) => {
                if (!current) return;
                setItems(result.items);
                setTotal(result.total);
            })
            .catch((cause: unknown) => {
                if (current) setError(cause instanceof Error ? cause.message : "读取已有媒体失败");
            })
            .finally(() => {
                if (current) setLoading(false);
            });
        return () => {
            current = false;
        };
    }, [keyword, page, retry, type]);

    const choose = (item: OfficialWorkMedia) => {
        if (onSelect) onSelect(item);
        else setPending((current) => (current.some((asset) => asset.storageKey === item.storageKey) ? current.filter((asset) => asset.storageKey !== item.storageKey) : [...current, item]));
    };

    return (
        <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap gap-2">
                <Segmented
                    value={type}
                    options={[{ value: "image", label: "图片" }, { value: "video", label: "视频" }, ...(imagesAndVideosOnly ? [] : [{ value: "audio", label: "音频" }])]}
                    onChange={(value) => {
                        setType(value as WorkPublicationMediaType);
                        setPage(1);
                    }}
                />
                <Input
                    className="min-w-0 flex-1 basis-40"
                    allowClear
                    placeholder="搜索文件名"
                    value={keyword}
                    onChange={(event) => {
                        setKeyword(event.target.value);
                        setPage(1);
                    }}
                />
            </div>
            {error ? (
                <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
                    <span>{error}</span>
                    <Button size="small" onClick={() => setRetry((value) => value + 1)}>
                        重试
                    </Button>
                </div>
            ) : (
                <div className="grid max-h-[40vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3" aria-busy={loading}>
                    {items.map((item) => {
                        const added = selected.includes(item.storageKey);
                        const checked = pending.some((asset) => asset.storageKey === item.storageKey);
                        return (
                            <button
                                type="button"
                                key={item.storageKey}
                                aria-label={onAdd ? item.originalName : undefined}
                                aria-pressed={onAdd ? checked : undefined}
                                disabled={added || loading}
                                className="min-w-0 rounded-md border border-[var(--gm-border)] p-2 text-left aria-pressed:border-[var(--gm-accent)] aria-pressed:bg-[var(--gm-wash)] disabled:opacity-50"
                                onClick={() => choose(item)}
                            >
                                {item.mediaType === "image" ? (
                                    <img src={imagePreviewUrl(item.previewUrl, 480)} alt="" className="aspect-video w-full rounded object-cover" />
                                ) : item.mediaType === "video" ? (
                                    <video src={item.previewUrl} className="aspect-video w-full rounded object-cover" muted preload="metadata" />
                                ) : (
                                    <span className="block text-xs">音频</span>
                                )}
                                <div className="mt-2 truncate text-xs" title={item.originalName}>
                                    {item.originalName}
                                </div>
                                {added ? <span className="text-xs">已添加</span> : checked ? <span className="text-xs">已选中</span> : null}
                            </button>
                        );
                    })}
                </div>
            )}
            {loading && !items.length ? (
                <p role="status" className="text-sm">
                    正在加载媒体…
                </p>
            ) : null}
            {!loading && !error && !items.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可选媒体" /> : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
                {total > PAGE_SIZE && !error ? <Pagination current={page} pageSize={PAGE_SIZE} total={total} showSizeChanger={false} onChange={setPage} /> : null}
                {onAdd ? (
                    <Button
                        className="ml-auto"
                        type="primary"
                        disabled={!pending.length}
                        onClick={() => {
                            onAdd(pending);
                            setPending([]);
                        }}
                    >
                        添加所选（{pending.length}）
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
