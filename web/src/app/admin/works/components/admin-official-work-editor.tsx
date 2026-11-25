"use client";

import { App } from "@/components/gamma-ui/gamma-ant-app";
import { Select } from "@/components/gamma-ui/gamma-ant-select";
import { Drawer } from "@/components/gamma-ui/gamma-ant-modal";
import { Input } from "@/components/gamma-ui/gamma-ant-input";
import { Button, Switch, Tag } from "@/components/gamma-ui/gamma-ant";
import { creativeUploadLimitMessage, creativeUploadMaxBytes, creativeUploadTypeFromMime } from "@/lib/creative-upload";
import { ArrowDown, ArrowUp, Film, ImagePlus, Music, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createOfficialWork, deleteOfficialWorkMedia, getOfficialWork, publishOfficialWork, updateOfficialWork, uploadOfficialWorkMedia, type OfficialWorkDraftInput, type OfficialWorkMedia, type WorkPublication } from "@/services/api/work-publications";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { AdminOfficialWorkMediaPicker } from "./admin-official-work-media-picker";

export function AdminOfficialWorkEditor({ open, work, onClose, onSaved }: { open: boolean; work?: WorkPublication; onClose: () => void; onSaved: (work: WorkPublication) => void }) {
    const { message, modal } = App.useApp();
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [publicPrompt, setPublicPrompt] = useState("");
    const [category, setCategory] = useState("其他");
    const [tags, setTags] = useState<string[]>([]);
    const [authorHidden, setAuthorHidden] = useState(false);
    const [authorName, setAuthorName] = useState("平台官方");
    const [assets, setAssets] = useState<OfficialWorkMedia[]>([]);
    const [cover, setCover] = useState("");
    const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
    const workId = work?.id;
    const [loaded, setLoaded] = useState<{ id?: string; error?: string; standaloneCoverName?: string }>();
    const [retry, setRetry] = useState(0);
    const ready = Boolean(loaded && loaded.id === workId && !loaded.error);
    const [saving, setSaving] = useState(false);
    const [uploaded, setUploaded] = useState<string[]>([]);
    const [dirty, setDirty] = useState(false);
    useEffect(() => {
        if (!open) {
            setMediaPickerOpen(false);
            setLoaded(undefined);
            return;
        }
        let current = true;
        const initialize = (details?: WorkPublication) => {
            const version = details?.currentVersion;
            const entries = details?.currentAssets || [];
            const media = entries
                .filter((asset) => asset.role === "content")
                .map((asset) => ({
                    storageKey: asset.storageKey,
                    mediaType: asset.mediaType,
                    mimeType: asset.mimeType,
                    originalName: String((asset.metadata as { originalName?: string } | null)?.originalName || asset.storageKey.split("/").at(-1) || "媒体"),
                    bytes: Number((asset.metadata as { bytes?: number } | null)?.bytes || 0),
                    previewUrl: asset.previewUrl || "",
                }));
            const savedCover = entries.find((asset) => asset.role === "cover");
            setTitle(version?.title || "");
            setDescription(version?.description || "");
            setPublicPrompt(version?.publicPrompt || "");
            setCategory(version?.category || "其他");
            setTags(version?.tags || []);
            setAuthorHidden(version?.authorDisplay === "hidden");
            setAuthorName(version?.authorName || "平台官方");
            setAssets(media);
            setCover(savedCover?.storageKey || "");
            setUploaded([]);
            setDirty(false);
            setLoaded({
                id: workId,
                standaloneCoverName: savedCover ? String((savedCover.metadata as { originalName?: string } | null)?.originalName || savedCover.storageKey.split("/").at(-1)) : undefined,
            });
        };
        if (workId) {
            setLoaded(undefined);
            void getOfficialWork(workId)
                .then((details) => {
                    if (current) initialize(details);
                })
                .catch((error: unknown) => {
                    if (current) setLoaded({ id: workId, error: error instanceof Error ? error.message : "读取官方作品失败" });
                });
        } else initialize();
        return () => {
            current = false;
        };
    }, [open, retry, workId]);
    const input = useMemo<OfficialWorkDraftInput>(
        () => ({ title, description, publicPrompt, category, tags, authorDisplay: authorHidden ? "hidden" : "custom", authorName: authorHidden ? undefined : authorName, coverStorageKey: cover, assetStorageKeys: assets.map((a) => a.storageKey) }),
        [assets, authorHidden, authorName, category, cover, description, publicPrompt, tags, title],
    );
    const save = async () => {
        if (!ready || saving || !title.trim() || !assets.length || !cover) return;
        setSaving(true);
        try {
            const saved = work ? await updateOfficialWork(work.id, input) : await createOfficialWork(input);
            setDirty(false);
            onSaved(saved);
            message.success("草稿已保存");
            return saved;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "保存草稿失败");
        } finally {
            setSaving(false);
        }
    };
    const publish = async () => {
        const saved = await save();
        const versionId = saved?.currentVersion?.id;
        if (!saved || !versionId) return;
        modal.confirm({
            title: saved.publishedVersionId ? "发布更新？" : "发布官方作品？",
            content: `${saved.currentVersion?.title || title} · ${assets.length} 个媒体。发布后将立即进入作品广场。`,
            okText: saved.publishedVersionId ? "发布更新" : "确认发布",
            onOk: async () => {
                const published = await publishOfficialWork(saved.id, versionId);
                onSaved(published);
                message.success("官方作品已发布");
                onClose();
            },
        });
    };
    const close = () => {
        const finish = async () => {
            if (uploaded.length) await deleteOfficialWorkMedia(uploaded);
            onClose();
        };
        if (dirty) modal.confirm({ title: "放弃未保存修改？", content: "本次新上传且未引用的媒体将被清理。", okText: "放弃修改", okButtonProps: { danger: true }, onOk: finish });
        else void finish();
    };
    const add = (additions: OfficialWorkMedia[]) => {
        setAssets((current) => [...new Map([...current, ...additions].map((asset) => [asset.storageKey, asset])).values()]);
        setCover((current) => current || additions.find((asset) => asset.mediaType === "image")?.storageKey || "");
        setDirty(true);
    };
    const move = (index: number, offset: number) =>
        setAssets((current) => {
            const next = [...current],
                target = index + offset;
            if (target < 0 || target >= next.length) return current;
            [next[index], next[target]] = [next[target], next[index]];
            setDirty(true);
            return next;
        });
    return (
        <Drawer
            open={open}
            size="large"
            styles={{ wrapper: { width: "min(720px, 100vw)" } }}
            title={work ? "编辑官方作品" : "发布官方作品"}
            onClose={close}
            destroyOnHidden
            footer={
                <div className="flex justify-end gap-2">
                    <Button onClick={close}>取消</Button>
                    <Button disabled={!ready || !title.trim() || !assets.length || !cover} loading={saving} onClick={() => void save()}>
                        保存草稿
                    </Button>
                    <Button type="primary" disabled={!ready || !title.trim() || !assets.length || !cover} loading={saving} onClick={() => void publish()}>
                        {work?.publishedVersionId ? "发布更新" : "发布"}
                    </Button>
                </div>
            }
        >
            {ready ? (
                <div className="min-w-0 space-y-4">
                    <div className="space-y-4" onChange={() => setDirty(true)}>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <Input value={title} maxLength={100} placeholder="作品标题" onChange={(e) => setTitle(e.target.value)} />
                            <Select
                                value={category}
                                options={["视觉设计", "插画", "摄影", "品牌内容", "视频", "短剧", "其他"].map((value) => ({ value, label: value }))}
                                onChange={(value) => {
                                    setCategory(value);
                                    setDirty(true);
                                }}
                            />
                            <Input value={authorName} disabled={authorHidden} maxLength={80} placeholder="官方作者名" onChange={(e) => setAuthorName(e.target.value)} />
                            <label className="flex items-center justify-between rounded-md border px-3">
                                <span>隐藏作者</span>
                                <Switch
                                    checked={authorHidden}
                                    onChange={(value) => {
                                        setAuthorHidden(value);
                                        setDirty(true);
                                    }}
                                />
                            </label>
                        </div>
                        <Input.TextArea rows={3} value={description} maxLength={2000} placeholder="作品说明" onChange={(e) => setDescription(e.target.value)} />
                        <Input.TextArea rows={4} value={publicPrompt} maxLength={8000} placeholder="公开提示词（选填）" onChange={(e) => setPublicPrompt(e.target.value)} />
                        <Select
                            mode="tags"
                            value={tags}
                            maxCount={10}
                            placeholder="标签"
                            onChange={(value) => {
                                setTags(value);
                                setDirty(true);
                            }}
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-2 text-sm">
                            <Upload className="size-4" />
                            上传媒体
                            <input
                                className="hidden"
                                type="file"
                                accept="image/*,video/*,audio/*"
                                onChange={async (event) => {
                                    const file = event.target.files?.[0];
                                    event.target.value = "";
                                    if (!file) return;
                                    const type = creativeUploadTypeFromMime(file.type);
                                    if (type && file.size > creativeUploadMaxBytes(type)) {
                                        message.error(creativeUploadLimitMessage(type));
                                        return;
                                    }
                                    try {
                                        const asset = await uploadOfficialWorkMedia(file);
                                        setUploaded((current) => [...current, asset.storageKey]);
                                        add([asset]);
                                    } catch (error) {
                                        message.error(error instanceof Error ? error.message : "上传媒体失败");
                                    }
                                }}
                            />
                        </label>
                        <Button icon={<ImagePlus className="size-4" />} onClick={() => setMediaPickerOpen(true)}>
                            选择已有媒体
                        </Button>
                    </div>
                    <section aria-label="作品媒体" className="min-w-0 space-y-2">
                        <h3 className="text-sm font-semibold">作品媒体（{assets.length}）</h3>
                        {!assets.length ? <p className="text-sm text-[var(--gm-text-3)]">尚未添加媒体。可上传文件或选择已有媒体。</p> : null}
                        {assets.length && !cover ? <p className="text-sm">请添加图片作为封面。</p> : null}
                        {cover && !assets.some((asset) => asset.storageKey === cover) ? <p className="break-all text-sm">封面：{loaded?.standaloneCoverName}</p> : null}
                        {assets.length ? (
                            <ol className="space-y-2">
                                {assets.map((asset, index) => (
                                    <li key={asset.storageKey} className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-[var(--gm-border)] p-2">
                                        {asset.mediaType === "image" && asset.previewUrl ? (
                                            <img src={imagePreviewUrl(asset.previewUrl, 160)} alt="" className="size-12 shrink-0 rounded object-cover" />
                                        ) : asset.mediaType === "video" && asset.previewUrl ? (
                                            <video src={asset.previewUrl} preload="metadata" muted className="size-12 shrink-0 rounded object-cover" />
                                        ) : (
                                            <span className="grid size-12 shrink-0 place-items-center" aria-hidden>
                                                {asset.mediaType === "audio" ? <Music size={20} /> : <Film size={20} />}
                                            </span>
                                        )}
                                        <div className="min-w-0 flex-1 basis-24">
                                            <div className="truncate text-sm" title={asset.originalName}>
                                                {asset.originalName}
                                            </div>
                                            <Tag className="mt-1">{asset.mediaType === "image" ? "图片" : asset.mediaType === "video" ? "视频" : "音频"}</Tag>
                                            {cover === asset.storageKey ? <Tag color="blue">封面</Tag> : null}
                                        </div>
                                        <div className="flex flex-wrap gap-1">
                                            {asset.mediaType === "image" && cover !== asset.storageKey ? (
                                                <Button
                                                    size="small"
                                                    onClick={() => {
                                                        setCover(asset.storageKey);
                                                        setDirty(true);
                                                    }}
                                                >
                                                    设为封面
                                                </Button>
                                            ) : null}
                                            <Button size="small" aria-label="上移" icon={<ArrowUp className="size-3.5" />} disabled={!index} onClick={() => move(index, -1)} />
                                            <Button size="small" aria-label="下移" icon={<ArrowDown className="size-3.5" />} disabled={index === assets.length - 1} onClick={() => move(index, 1)} />
                                            <Button
                                                size="small"
                                                danger
                                                aria-label="移除"
                                                icon={<Trash2 className="size-3.5" />}
                                                onClick={() => {
                                                    const remaining = assets.filter((item) => item.storageKey !== asset.storageKey);
                                                    setAssets(remaining);
                                                    if (cover === asset.storageKey) setCover(remaining.find((item) => item.mediaType === "image")?.storageKey || "");
                                                    setDirty(true);
                                                }}
                                            />
                                        </div>
                                    </li>
                                ))}
                            </ol>
                        ) : null}
                    </section>
                    <AdminOfficialWorkMediaPicker
                        open={mediaPickerOpen}
                        selected={assets.map((asset) => asset.storageKey)}
                        onClose={() => setMediaPickerOpen(false)}
                        onAdd={(selection) => {
                            add(selection);
                            setMediaPickerOpen(false);
                        }}
                    />
                </div>
            ) : loaded?.error && loaded.id === workId ? (
                <div role="alert" className="flex flex-wrap items-center gap-2">
                    <span>{loaded.error}</span>
                    <Button
                        onClick={() => {
                            setLoaded(undefined);
                            setRetry((value) => value + 1);
                        }}
                    >
                        重试
                    </Button>
                </div>
            ) : (
                <p role="status">正在加载作品…</p>
            )}
        </Drawer>
    );
}
