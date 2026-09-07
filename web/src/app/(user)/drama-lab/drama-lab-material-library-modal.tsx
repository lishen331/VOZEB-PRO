"use client";

import { App, Button, Empty, Image, Input, Modal, Pagination, Spin, Tag } from "antd";
import { ImagePlus, Pencil, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { DRAMA_LIBRARY_ASSET_LABELS, type DramaLibraryAssetType } from "@/lib/drama-lab-library-assets";
import type { Asset, CreateLibraryAssetInput, ImageAsset } from "@/lib/library-asset-contract";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { createImageGenerationTask, waitForImageGenerationTask } from "@/services/api/image";
import { deleteLibraryAsset, listLibraryAssetPage, saveLibraryAsset } from "@/services/api/library-assets";
import { uploadImage, type UploadedImage } from "@/services/image-storage";
import { useEffectiveConfig } from "@/stores/use-config-store";

type EditorDraft = {
    asset: ImageAsset;
    title: string;
    category: string;
    note: string;
    tags: string;
    replacement?: UploadedImage;
};

export function DramaLabMaterialLibraryModal({ open, type, onClose }: { open: boolean; type: DramaLibraryAssetType; onClose: () => void }) {
    const { message, modal } = App.useApp();
    const config = useEffectiveConfig();
    const uploadRef = useRef<HTMLInputElement>(null);
    const [assets, setAssets] = useState<Asset[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [keyword, setKeyword] = useState("");
    const [loading, setLoading] = useState(false);
    const [editor, setEditor] = useState<EditorDraft>();
    const [saving, setSaving] = useState(false);
    const [generating, setGenerating] = useState(false);
    const label = DRAMA_LIBRARY_ASSET_LABELS[type];

    useEffect(() => {
        if (!open) return;
        const controller = new AbortController();
        const timer = window.setTimeout(
            async () => {
                setLoading(true);
                try {
                    const result = await listLibraryAssetPage({ page, pageSize, kind: "image", keyword, dramaAssetType: type }, controller.signal);
                    setAssets(result.assets);
                    setTotal(result.total);
                } catch (error) {
                    if (!controller.signal.aborted) message.error(error instanceof Error ? error.message : "素材库加载失败");
                } finally {
                    if (!controller.signal.aborted) setLoading(false);
                }
            },
            keyword ? 300 : 0,
        );
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [keyword, message, open, page, pageSize, type]);

    useEffect(() => {
        setPage(1);
        setKeyword("");
        setEditor(undefined);
    }, [open, type]);

    const reload = async () => {
        setLoading(true);
        try {
            const result = await listLibraryAssetPage({ page, pageSize, kind: "image", keyword, dramaAssetType: type });
            setAssets(result.assets);
            setTotal(result.total);
        } finally {
            setLoading(false);
        }
    };

    const openEditor = (asset: Asset) => {
        if (asset.kind !== "image") return;
        setEditor({
            asset,
            title: asset.title,
            category: typeof asset.metadata?.category === "string" ? asset.metadata.category : "",
            note: asset.note || "",
            tags: asset.tags.filter((tag) => !["短剧", label].includes(tag)).join("，"),
        });
    };

    const setReplacement = async (file?: File) => {
        if (!file) return;
        try {
            setSaving(true);
            const image = await uploadImage(file);
            setEditor((current) => (current ? { ...current, replacement: image } : current));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "图片上传失败");
        } finally {
            setSaving(false);
            if (uploadRef.current) uploadRef.current.value = "";
        }
    };

    const generateImage = async () => {
        if (!editor?.title.trim()) return message.warning(`请先填写${label}名称`);
        setGenerating(true);
        try {
            const imageConfig = { ...config, model: config.imageModel || config.model, imageModel: config.imageModel || config.model, size: "1:1", count: "1" };
            const prompt = [`短剧${label}素材设定图`, `名称：${editor.title.trim()}`, editor.category.trim() ? `分类：${editor.category.trim()}` : "", editor.note.trim() ? `描述：${editor.note.trim()}` : "", "主体结构清晰，干净背景，不添加文字。"]
                .filter(Boolean)
                .join("\n");
            const task = await createImageGenerationTask(imageConfig, prompt, [], undefined, { logSource: "drama", logTitle: `${label}素材 · ${editor.title.trim()}`, surface: "drama" });
            const result = await waitForImageGenerationTask(imageConfig, task);
            const source = result.serverUrl || result.remoteUrl || result.dataUrl;
            if (!source) throw new Error("图片任务没有返回结果");
            const image = await uploadImage(source);
            setEditor((current) => (current ? { ...current, replacement: image } : current));
            message.success("图片已生成，保存后更新素材");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "AI 生成失败");
        } finally {
            setGenerating(false);
        }
    };

    const saveEditor = async () => {
        if (!editor?.title.trim()) return message.warning(`请输入${label}名称`);
        setSaving(true);
        try {
            const media = editor.replacement;
            const current = editor.asset;
            const customTags = editor.tags
                .split(/[，,]/)
                .map((tag) => tag.trim())
                .filter(Boolean);
            const payload: CreateLibraryAssetInput = {
                kind: "image",
                title: editor.title.trim(),
                coverUrl: media?.url || current.coverUrl || current.data.serverUrl || current.data.dataUrl,
                tags: Array.from(new Set(["短剧", label, ...customTags])),
                source: current.source || "短剧实验室",
                note: editor.note.trim(),
                metadata: { ...current.metadata, source: "drama-lab", dramaAssetType: type, category: editor.category.trim() },
                data: media ? { dataUrl: media.url, storageKey: media.storageKey, serverUrl: media.url, remoteUrl: media.remoteUrl, width: media.width, height: media.height, bytes: media.bytes, mimeType: media.mimeType } : current.data,
            };
            await saveLibraryAsset(current.id, payload);
            message.success("已保存");
            setEditor(undefined);
            await reload();
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材保存失败");
        } finally {
            setSaving(false);
        }
    };

    const confirmDelete = (asset: Asset) => {
        modal.confirm({
            title: "删除确认",
            content: `确定删除素材${label}「${asset.title.slice(0, 20) || "未命名"}」吗？`,
            okText: "删除",
            okButtonProps: { danger: true },
            cancelText: "取消",
            onOk: async () => {
                await deleteLibraryAsset(asset.id);
                message.success("已删除");
                if (assets.length === 1 && page > 1) setPage((value) => value - 1);
                else await reload();
            },
        });
    };

    return (
        <>
            <Modal title={`素材库 · ${label}`} open={open} onCancel={onClose} width={760} footer={<Button onClick={onClose}>关闭</Button>} destroyOnHidden>
                <Input.Search
                    allowClear
                    className="mb-3 max-w-sm"
                    placeholder={type === "scene" ? "搜索地点或描述" : "搜索名称或描述"}
                    value={keyword}
                    onChange={(event) => {
                        setKeyword(event.target.value);
                        setPage(1);
                    }}
                />
                <div className="min-h-64 max-h-[58vh] overflow-y-auto rounded-md border border-border p-2">
                    {loading ? (
                        <div className="grid min-h-60 place-items-center">
                            <Spin />
                        </div>
                    ) : assets.length ? (
                        <div className="grid gap-2">
                            {assets.map((asset) => {
                                const imageAsset = asset.kind === "image" ? asset : undefined;
                                const url = imageAsset?.data.serverUrl || imageAsset?.data.remoteUrl || imageAsset?.data.dataUrl || asset.coverUrl;
                                const category = typeof asset.metadata?.category === "string" ? asset.metadata.category : "";
                                return (
                                    <article key={asset.id} className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
                                        <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded border border-border bg-muted/40">
                                            {url ? <Image src={imagePreviewUrl(url, 320)} preview={{ src: imagePreviewUrl(url, 1600) }} alt={asset.title} className="!size-20 !object-cover" /> : <ImagePlus className="size-6 text-muted-foreground" />}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate font-medium">{asset.title || "未命名"}</div>
                                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{asset.note || "暂无描述"}</p>
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {category ? <Tag>{category}</Tag> : null}
                                                {asset.tags
                                                    .filter((tag) => !["短剧", label].includes(tag))
                                                    .slice(0, 4)
                                                    .map((tag) => (
                                                        <Tag key={tag}>{tag}</Tag>
                                                    ))}
                                            </div>
                                        </div>
                                        <div className="flex shrink-0 gap-2">
                                            <Button size="small" icon={<Pencil className="size-3.5" />} onClick={() => openEditor(asset)}>
                                                编辑
                                            </Button>
                                            <Button size="small" danger icon={<Trash2 className="size-3.5" />} onClick={() => confirmDelete(asset)}>
                                                删除
                                            </Button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="grid min-h-60 place-items-center">
                            <Empty description={`素材库暂无${label}，可在项目中将${label}「加入素材库」后在此查看`} />
                        </div>
                    )}
                </div>
                <div className="mt-3 flex justify-center">
                    <Pagination
                        current={page}
                        pageSize={pageSize}
                        total={total}
                        showSizeChanger
                        pageSizeOptions={[10, 20, 50]}
                        showTotal={(value) => `共 ${value} 条`}
                        onChange={(nextPage, nextPageSize) => {
                            setPage(nextPageSize === pageSize ? nextPage : 1);
                            setPageSize(nextPageSize);
                        }}
                    />
                </div>
            </Modal>

            <Modal title={`编辑素材${label}`} open={Boolean(editor)} onCancel={() => setEditor(undefined)} onOk={() => void saveEditor()} okText="保存" cancelText="取消" confirmLoading={saving} destroyOnHidden>
                {editor ? (
                    <div className="grid gap-3">
                        <div className="flex items-center gap-3">
                            <div className="grid size-24 place-items-center overflow-hidden rounded border border-border bg-muted/40">
                                <img src={imagePreviewUrl(editor.replacement?.url || editor.asset.data.serverUrl || editor.asset.data.dataUrl, 320)} alt="" className="size-full object-cover" />
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button icon={<Upload className="size-3.5" />} loading={saving} onClick={() => uploadRef.current?.click()}>
                                    上传图片
                                </Button>
                                <Button type="primary" icon={<Sparkles className="size-3.5" />} loading={generating} onClick={() => void generateImage()}>
                                    AI 生成
                                </Button>
                            </div>
                        </div>
                        <label className="grid gap-1 text-sm">
                            <span>{type === "scene" ? "地点" : "名称"}</span>
                            <Input value={editor.title} onChange={(event) => setEditor({ ...editor, title: event.target.value })} />
                        </label>
                        {type === "scene" ? (
                            <label className="grid gap-1 text-sm">
                                <span>时间</span>
                                <Input value={editor.category} onChange={(event) => setEditor({ ...editor, category: event.target.value })} placeholder="如：白天/夜晚" />
                            </label>
                        ) : (
                            <label className="grid gap-1 text-sm">
                                <span>分类</span>
                                <Input value={editor.category} onChange={(event) => setEditor({ ...editor, category: event.target.value })} placeholder="可选" />
                            </label>
                        )}
                        <label className="grid gap-1 text-sm">
                            <span>描述</span>
                            <Input.TextArea rows={3} value={editor.note} onChange={(event) => setEditor({ ...editor, note: event.target.value })} placeholder="可选" />
                        </label>
                        <label className="grid gap-1 text-sm">
                            <span>标签</span>
                            <Input value={editor.tags} onChange={(event) => setEditor({ ...editor, tags: event.target.value })} placeholder="可选，逗号分隔" />
                        </label>
                    </div>
                ) : null}
                <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={(event) => void setReplacement(event.target.files?.[0])} />
            </Modal>
        </>
    );
}
