"use client";

import { Button, Empty, Input, Modal, Pagination, Segmented } from "antd";
import { useEffect, useState } from "react";
import { listOfficialWorkMedia, type OfficialWorkMedia, type WorkPublicationMediaType } from "@/services/api/work-publications";

export function AdminOfficialWorkMediaPicker({ open, selected, onClose, onSelect }: { open: boolean; selected: string[]; onClose: () => void; onSelect: (asset: OfficialWorkMedia) => void }) {
    const [type, setType] = useState<WorkPublicationMediaType>("image");
    const [keyword, setKeyword] = useState("");
    const [page, setPage] = useState(1);
    const [items, setItems] = useState<OfficialWorkMedia[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        if (!open) return;
        setLoading(true);
        void listOfficialWorkMedia({ page, pageSize: 12, type, keyword: keyword || undefined })
            .then((result) => {
                setItems(result.items);
                setTotal(result.total);
            })
            .finally(() => setLoading(false));
    }, [keyword, open, page, type]);
    return (
        <Modal open={open} width="min(760px, 100vw)" title="选择已有永久媒体" footer={null} onCancel={onClose}>
            <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                    <Segmented
                        value={type}
                        options={[
                            { value: "image", label: "图片" },
                            { value: "video", label: "视频" },
                            { value: "audio", label: "音频" },
                        ]}
                        onChange={(value) => {
                            setType(value as WorkPublicationMediaType);
                            setPage(1);
                        }}
                    />
                    <Input
                        className="min-w-48 flex-1"
                        allowClear
                        placeholder="搜索文件名"
                        value={keyword}
                        onChange={(event) => {
                            setKeyword(event.target.value);
                            setPage(1);
                        }}
                    />
                </div>
                <div className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                    {items.map((item) => (
                        <button
                            type="button"
                            key={item.storageKey}
                            disabled={selected.includes(item.storageKey)}
                            className="min-w-0 rounded-md border border-stone-200 p-2 text-left disabled:opacity-45 dark:border-stone-700"
                            onClick={() => onSelect(item)}
                        >
                            {item.mediaType === "image" ? (
                                <img src={item.previewUrl} alt={item.originalName} className="aspect-video w-full rounded object-cover" />
                            ) : item.mediaType === "video" ? (
                                <video src={item.previewUrl} className="aspect-video w-full rounded object-cover" muted />
                            ) : (
                                <audio src={item.previewUrl} controls className="w-full" />
                            )}
                            <div className="mt-2 truncate text-xs">{item.originalName}</div>
                        </button>
                    ))}
                </div>
                {!loading && !items.length ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有可选媒体" /> : null}
                {total > 12 ? <Pagination current={page} pageSize={12} total={total} showSizeChanger={false} onChange={setPage} /> : null}
            </div>
        </Modal>
    );
}
