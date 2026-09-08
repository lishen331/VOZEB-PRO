"use client";

import { App, Button, Drawer, Input, Select, Switch, Tag } from "antd";
import { creativeUploadLimitMessage, creativeUploadMaxBytes, creativeUploadTypeFromMime } from "@/lib/creative-upload";
import { ArrowDown, ArrowUp, ImagePlus, Trash2, Upload } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createOfficialWork, deleteOfficialWorkMedia, publishOfficialWork, updateOfficialWork, uploadOfficialWorkMedia, type OfficialWorkDraftInput, type OfficialWorkMedia, type WorkPublication } from "@/services/api/work-publications";
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
    const [picker, setPicker] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploaded, setUploaded] = useState<string[]>([]);
    const [dirty, setDirty] = useState(false);
    useEffect(() => {
        if (!open) return;
        const version = work?.currentVersion;
        const media = (work?.currentAssets || [])
            .filter((a) => a.role === "content")
            .map((a) => ({
                storageKey: a.storageKey,
                mediaType: a.mediaType,
                mimeType: a.mimeType,
                originalName: String((a.metadata as { originalName?: string })?.originalName || a.storageKey.split("/").at(-1) || "媒体"),
                bytes: Number((a.metadata as { bytes?: number })?.bytes || 0),
                previewUrl: a.previewUrl || "",
            }));
        setTitle(version?.title || "");
        setDescription(version?.description || "");
        setPublicPrompt(version?.publicPrompt || "");
        setCategory(version?.category || "其他");
        setTags(version?.tags || []);
        setAuthorHidden(version?.authorDisplay === "hidden");
        setAuthorName(version?.authorName || "平台官方");
        setAssets(media);
        setCover((work?.currentAssets || []).find((a) => a.role === "cover")?.storageKey || "");
        setUploaded([]);
        setDirty(false);
    }, [open, work]);
    const input = useMemo<OfficialWorkDraftInput>(
        () => ({ title, description, publicPrompt, category, tags, authorDisplay: authorHidden ? "hidden" : "custom", authorName: authorHidden ? undefined : authorName, coverStorageKey: cover, assetStorageKeys: assets.map((a) => a.storageKey) }),
        [assets, authorHidden, authorName, category, cover, description, publicPrompt, tags, title],
    );
    const save = async () => {
        setSaving(true);
        try {
            const saved = work ? await updateOfficialWork(work.id, input) : await createOfficialWork(input);
            setDirty(false);
            onSaved(saved);
            message.success("草稿已保存");
            return saved;
        } finally {
            setSaving(false);
        }
    };
    const publish = async () => {
        const saved = await save();
        const versionId = saved.currentVersion?.id;
        if (!versionId) return;
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
    const add = (asset: OfficialWorkMedia) => {
        setAssets((current) => (current.some((item) => item.storageKey === asset.storageKey) ? current : [...current, asset]));
        if (asset.mediaType === "image" && !cover) setCover(asset.storageKey);
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
        <>
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
                        <Button loading={saving} onClick={() => void save()}>
                            保存草稿
                        </Button>
                        <Button type="primary" loading={saving} onClick={() => void publish()}>
                            {work?.publishedVersionId ? "发布更新" : "发布"}
                        </Button>
                    </div>
                }
            >
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
                    <div className="flex flex-wrap gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border px-3 py-2">
                            <Upload className="size-4" />
                            上传媒体
                            <input
                                className="hidden"
                                type="file"
                                accept="image/*,video/*,audio/*"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = "";
                                    if (!file) return;
                                    const type = creativeUploadTypeFromMime(file.type);
                                    if (type && file.size > creativeUploadMaxBytes(type)) {
                                        message.error(creativeUploadLimitMessage(type));
                                        return;
                                    }
                                    const asset = await uploadOfficialWorkMedia(file);
                                    setUploaded((c) => [...c, asset.storageKey]);
                                    add(asset);
                                }}
                            />
                        </label>
                        <Button icon={<ImagePlus className="size-4" />} onClick={() => setPicker(true)}>
                            选择已有媒体
                        </Button>
                    </div>
                    <div className="space-y-2">
                        {assets.map((asset, index) => (
                            <div key={asset.storageKey} className="flex min-w-0 items-center gap-2 rounded-md border p-2">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm">{asset.originalName}</div>
                                    <Tag className="mt-1">{asset.mediaType}</Tag>
                                    {cover === asset.storageKey ? <Tag color="blue">封面</Tag> : null}
                                </div>
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
                                <Button size="small" aria-label="上移" icon={<ArrowUp className="size-3" />} disabled={!index} onClick={() => move(index, -1)} />
                                <Button size="small" aria-label="下移" icon={<ArrowDown className="size-3" />} disabled={index === assets.length - 1} onClick={() => move(index, 1)} />
                                <Button
                                    size="small"
                                    danger
                                    aria-label="移除"
                                    icon={<Trash2 className="size-3" />}
                                    onClick={() => {
                                        setAssets((c) => c.filter((item) => item.storageKey !== asset.storageKey));
                                        if (cover === asset.storageKey) setCover("");
                                        setDirty(true);
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </Drawer>
            <AdminOfficialWorkMediaPicker
                open={picker}
                selected={assets.map((a) => a.storageKey)}
                onClose={() => setPicker(false)}
                onSelect={(asset) => {
                    add(asset);
                    setPicker(false);
                }}
            />
        </>
    );
}
