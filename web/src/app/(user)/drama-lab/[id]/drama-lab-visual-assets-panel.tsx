"use client";

import type { DramaAssetVisualDetails } from "@/lib/drama-project-contract";
import { buildDramaLabAssetImagePrompt, readDramaLabAssetVisualDetails } from "@/lib/drama-lab-asset-image-prompt";

import { Button, Image, Input, Modal, Tabs, Tooltip } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import { Check, Edit2, ImagePlus, Images, LibraryBig, MapPin, Package, Plus, Sparkles, Trash2, Upload, Users, Video } from "lucide-react";
import { nanoid } from "nanoid";
import { useMemo, useRef, useState, type RefObject } from "react";

import { dramaAssetPrimaryReference, dramaAssetReferences } from "@/lib/drama-asset-references";
import type { Asset } from "@/lib/library-asset-contract";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { createImageGenerationTask, waitForImageGenerationTask, type ImageGenerationResult } from "@/services/api/image";
import { createLibraryAsset } from "@/services/api/library-assets";
import { uploadImage } from "@/services/image-storage";
import { useEffectiveConfig } from "@/stores/use-config-store";

import type { Character, DramaLabAssetProfile, DramaLabAssetReference, Episode, Project, Prop, Scene, Shot } from "./drama-workflow-lab-project-complete";

import { DramaLabAssetLibraryPicker } from "./drama-lab-asset-library-picker";
import { DramaLabAssetDetailFields } from "./drama-lab-asset-detail-fields";

type AssetKind = "characters" | "scenes" | "props";
type VisualAsset = Character | Scene | Prop;
type EditorState = { kind: AssetKind; asset?: VisualAsset };
type ProjectUpdate = Partial<Project> | ((current: Project) => Partial<Project>);

const EMPTY_PROFILE: DramaLabAssetProfile = { visualIdentity: "", styling: "", colorPalette: "", consistencyRules: "" };
const ASSET_META = {
    characters: { label: "角色", icon: Users, aspect: "aspect-[4/5]" },
    scenes: { label: "场景", icon: MapPin, aspect: "aspect-[16/10]" },
    props: { label: "道具", icon: Package, aspect: "aspect-square" },
} satisfies Record<AssetKind, { label: string; icon: typeof Users; aspect: string }>;

export function DramaLabVisualAssetsPanel({
    project,
    episode,
    onSave,
    onReload,
    onLocateShot,
    messageApi,
}: {
    project: Project;
    episode?: Episode;
    onSave: (updates: ProjectUpdate) => Promise<boolean>;
    onReload: () => Promise<void>;
    onLocateShot: (episodeId: string, shotId: string) => void;
    messageApi: MessageInstance;
}) {
    const config = useEffectiveConfig();
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const [kind, setKind] = useState<AssetKind>("characters");
    const [editor, setEditor] = useState<EditorState>();
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [busyKey, setBusyKey] = useState("");

    const assets = project[kind] as VisualAsset[];
    const definition = ASSET_META[kind];
    const activeAsset = editor?.asset;

    const assetShots = useMemo(() => {
        const grouped = new Map<string, Shot[]>();
        for (const shot of project.shots) {
            for (const id of shotAssetIds(shot)) grouped.set(id, [...(grouped.get(id) || []), shot]);
        }
        return grouped;
    }, [project.shots]);

    const replaceAssetsFor = async (assetKind: AssetKind, next: VisualAsset[] | ((current: VisualAsset[]) => VisualAsset[])) =>
        onSave(
            (currentProject) =>
                ({
                    [assetKind]: typeof next === "function" ? next(currentProject[assetKind] as VisualAsset[]) : next,
                }) as Partial<Project>,
        );

    const replaceAssets = (next: VisualAsset[] | ((current: VisualAsset[]) => VisualAsset[])) => replaceAssetsFor(kind, next);

    const updateAsset = async (assetId: string, patch: Partial<VisualAsset>) => {
        return replaceAssets((current) => current.map((asset) => (asset.id === assetId ? { ...asset, ...patch } : asset)));
    };

    const extractAssetsForKind = async (assetKind: AssetKind) => {
        if (!episode?.script.trim()) throw new Error("请先填写当前集剧本");

        const resourceType = assetKind === "characters" ? "character" : assetKind === "scenes" ? "scene" : "prop";
        const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/extract-assets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ episodeId: episode.id, assetType: resourceType, requestId: `drama-lab-extract:${project.id}:${episode.id}:${resourceType}:${nanoid()}` }),
        });
        const payload = (await response.json()) as { code?: number; msg?: string; data?: { assets?: Array<DramaAssetVisualDetails & { id?: string; name?: string; description?: string; location?: string }> } };
        if (!response.ok || payload.code !== 0) throw new Error(payload.msg || "资产提取失败");

        const extracted = (payload.data?.assets || []).flatMap((asset) => {
            const name = asset.name?.trim() || "";
            if (!name) return [];
            return [
                createAsset(assetKind, {
                    ...readDramaLabAssetVisualDetails(asset),
                    id: asset.id || `${assetKind}-${nanoid()}`,
                    name,
                    description: asset.description || "",
                    ...(assetKind === "scenes" ? { location: asset.location || name, time: asset.time } : {}),
                }),
            ];
        });

        if (!extracted.length) return 0;

        let addedCount = 0;
        const saved = await replaceAssetsFor(assetKind, (current) => {
            const names = new Set(current.map((asset) => assetName(asset).trim()));
            const additions = extracted.filter((asset) => {
                const name = assetName(asset).trim();
                if (!name || names.has(name)) return false;
                names.add(name);
                return true;
            });
            addedCount = additions.length;
            return [...current, ...additions];
        });
        if (!saved) throw new Error("项目保存失败");
        return addedCount;
    };

    const extractFromScript = async () => {
        if (!episode?.script.trim()) {
            messageApi.warning("请先填写当前集剧本");
            return;
        }
        const requestKey = `extract:${kind}`;
        setBusyKey(requestKey);
        try {
            const addedCount = await extractAssetsForKind(kind);
            if (!addedCount) {
                messageApi.info(`没有发现需要新增的${definition.label}`);
                return;
            }
            messageApi.success(`已从剧本提取 ${addedCount} 个${definition.label}`);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "资产提取失败");
        } finally {
            setBusyKey("");
        }
    };

    const extractAllFromScript = async () => {
        if (!episode?.script.trim()) {
            messageApi.warning("请先填写当前集剧本");
            return;
        }
        setBusyKey("extract:all");
        const labels: Record<AssetKind, string> = { characters: "角色", scenes: "场景", props: "道具" };
        const failed: string[] = [];
        const completed: string[] = [];
        let addedCount = 0;
        try {
            for (const assetKind of ["characters", "scenes", "props"] as const) {
                try {
                    addedCount += await extractAssetsForKind(assetKind);
                    completed.push(labels[assetKind]);
                } catch (error) {
                    failed.push(`${labels[assetKind]}：${error instanceof Error ? error.message : "提取失败"}`);
                }
            }
            if (failed.length) {
                const succeeded = completed.length ? `已完成：${completed.join("、")}。` : "";
                messageApi.error(`${succeeded}部分资产提取失败：${failed.join("；")}`);
            } else {
                messageApi.success(`一键提取完成，新增 ${addedCount} 个资产`);
            }
        } finally {
            setBusyKey("");
        }
    };

    const importLibraryAsset = async (libraryAsset: Asset) => {
        if (libraryAsset.kind !== "image") return;
        const current = project[kind] as VisualAsset[];
        if (current.some((asset) => assetName(asset).trim() === libraryAsset.title.trim())) {
            messageApi.warning(`本剧${definition.label}库已存在同名资产`);
            return;
        }
        const url = libraryAsset.data.serverUrl || libraryAsset.data.remoteUrl || libraryAsset.data.dataUrl || libraryAsset.coverUrl;
        if (!url) {
            messageApi.warning("该素材没有可引用的图片");
            return;
        }
        const reference = referenceFromUrl(url, "library", libraryAsset.title, libraryAsset.data.storageKey, libraryAsset.data.width, libraryAsset.data.height);
        const next = createAsset(kind, {
            id: `${kind}-${nanoid()}`,
            name: libraryAsset.title,
            ...readDramaLabAssetVisualDetails(libraryAsset.metadata),
            description: libraryAsset.note || libraryAsset.tags.join("、"),
            references: [reference],
            primaryReferenceId: reference.id,
            referenceImageUrl: reference.url,
            referenceStorageKey: reference.storageKey,
        });
        setBusyKey(`library:${libraryAsset.id}`);
        try {
            if (!(await replaceAssets([...current, next]))) throw new Error("项目保存失败");
            messageApi.success(`已从素材库添加${definition.label}：${libraryAsset.title}`);
            setLibraryOpen(false);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "素材导入失败");
        } finally {
            setBusyKey("");
        }
    };

    const appendReferences = async (asset: VisualAsset, added: DramaLabAssetReference[]) => {
        const primary = added[0];
        if (!primary) return false;
        return updateAsset(asset.id, {
            references: [...dramaAssetReferences(asset), ...added],
            primaryReferenceId: primary.id,
            referenceImageUrl: primary.url,
            referenceStorageKey: primary.storageKey,
            imageUrl: primary.url,
        });
    };

    const generateAssetReference = async (asset: VisualAsset) => {
        const requestKey = `asset:${asset.id}`;
        setBusyKey(requestKey);
        try {
            const prompt = buildDramaLabAssetImagePrompt(project, asset, kind);
            const imageConfig = { ...config, model: config.imageModel || config.model, imageModel: config.imageModel || config.model, size: project.aspectRatio || config.size, count: "1" };
            const task = await createImageGenerationTask(imageConfig, prompt, [], undefined, {
                logSource: "drama",
                logTitle: `${project.title} · ${asset.name}${definition.label}设定图`,
                surface: "drama",
                projectId: project.id,
                clientRequestId: `drama-lab-asset:${project.id}:${asset.id}:${nanoid()}`,
            });
            const references = imageResultsToReferences(await waitForImageGenerationTask(imageConfig, task));
            if (!references.length) throw new Error("生成结果没有可持久化图片地址");
            if (!(await appendReferences(asset, references))) throw new Error("项目保存失败");
            messageApi.success(references.length > 1 ? `已生成 ${references.length} 张候选图` : "候选图已生成并设为主参考图");
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "资产图片生成失败");
        } finally {
            setBusyKey("");
        }
    };

    const uploadReference = async (file?: File) => {
        if (!file || !activeAsset) return;
        const requestKey = `upload:${activeAsset.id}`;
        setBusyKey(requestKey);
        try {
            const stored = await uploadImage(file);
            const reference = referenceFromUrl(stored.serverUrl || stored.url, "upload", file.name, stored.storageKey, stored.width, stored.height);
            if (!(await appendReferences(activeAsset, [reference]))) throw new Error("项目保存失败");
            messageApi.success("参考图已上传并设为主参考图");
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "参考图上传失败");
        } finally {
            setBusyKey("");
            if (uploadInputRef.current) uploadInputRef.current.value = "";
        }
    };

    const setPrimary = async (asset: VisualAsset, reference: DramaLabAssetReference) => {
        if (!(await updateAsset(asset.id, { primaryReferenceId: reference.id, referenceImageUrl: reference.url, referenceStorageKey: reference.storageKey, imageUrl: reference.url }))) return;
        messageApi.success("已设为主参考图");
    };

    const removeReference = async (asset: VisualAsset, referenceId: string) => {
        const references = dramaAssetReferences(asset).filter((reference) => reference.id !== referenceId);
        const primary = references.find((reference) => reference.id === asset.primaryReferenceId) || references[0];
        if (!(await updateAsset(asset.id, { references, primaryReferenceId: primary?.id, referenceImageUrl: primary?.url, referenceStorageKey: primary?.storageKey, imageUrl: primary?.url }))) return;
        messageApi.success("参考图已移除");
    };

    const saveEditor = async () => {
        if (!editor?.asset) return;
        const name = assetName(editor.asset).trim();
        if (!name) return messageApi.warning(`请输入${definition.label}名称`);
        const next = createAsset(editor.kind, { ...editor.asset, id: editor.asset.id || `${editor.kind}-${nanoid()}`, name, description: editor.asset.description?.trim() || "" });
        const current = project[editor.kind] as VisualAsset[];
        const saved = editor.asset.id ? await onSave({ [editor.kind]: current.map((asset) => (asset.id === editor.asset!.id ? next : asset)) } as Partial<Project>) : await onSave({ [editor.kind]: [...current, next] } as Partial<Project>);
        if (saved) {
            messageApi.success(`${ASSET_META[editor.kind].label}设定已保存`);
            setEditor(undefined);
        }
    };

    const addAsset = () => {
        setEditor({ kind, asset: createAsset(kind, { id: "", name: "", description: "", profile: { ...EMPTY_PROFILE } }) });
    };

    const regenerateShot = async (shot: Shot) => {
        const requestKey = `shot:${shot.id}`;
        setBusyKey(requestKey);
        try {
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/shots/${encodeURIComponent(shot.id)}/generate-image?episodeId=${encodeURIComponent(shot.episodeId)}`, { method: "POST" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || data.code !== 0) throw new Error(data.msg || "分镜图任务创建失败");
            await onReload();
            messageApi.success(`分镜 ${shot.shotNumber} 已按最新主参考图提交重生成`);
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "分镜重生成失败");
        } finally {
            setBusyKey("");
        }
    };

    return (
        <div className="mx-auto max-w-6xl" data-drama-lab-visual-assets>
            <Tabs
                activeKey={kind}
                onChange={(value) => setKind(value as AssetKind)}
                tabBarExtraContent={
                    <div className="flex items-center gap-2">
                        <Button type="primary" icon={<Sparkles className="size-3.5" />} loading={busyKey === "extract:all"} disabled={busyKey.startsWith("extract:")} onClick={() => void extractAllFromScript()}>
                            一键提取
                        </Button>
                        <Button icon={<Sparkles className="size-3.5" />} loading={busyKey === `extract:${kind}`} disabled={busyKey.startsWith("extract:")} onClick={() => void extractFromScript()}>
                            提取{definition.label}
                        </Button>
                        <Button icon={<LibraryBig className="size-3.5" />} disabled={busyKey.startsWith("extract:")} onClick={() => setLibraryOpen(true)}>
                            从素材库添加
                        </Button>
                        <Button type="primary" icon={<Plus className="size-3.5" />} disabled={busyKey.startsWith("extract:")} onClick={addAsset}>
                            新增{definition.label}
                        </Button>
                    </div>
                }
                items={(Object.keys(ASSET_META) as AssetKind[]).map((assetKind) => ({
                    key: assetKind,
                    label: `${ASSET_META[assetKind].label} (${project[assetKind].length})`,
                    children: (
                        <div className="pt-2">
                            {(project[assetKind] as VisualAsset[]).length ? (
                                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                                    {(project[assetKind] as VisualAsset[]).map((asset) => {
                                        const references = dramaAssetReferences(asset);
                                        const primary = dramaAssetPrimaryReference(asset);
                                        const affected = assetShots.get(asset.id) || [];
                                        const meta = ASSET_META[assetKind];
                                        const Icon = meta.icon;
                                        return (
                                            <article key={asset.id} className="overflow-hidden rounded-md border border-border bg-card" data-drama-lab-asset-card={asset.id}>
                                                <div className={`relative grid ${meta.aspect} place-items-center overflow-hidden bg-muted/50`}>
                                                    {primary?.url ? (
                                                        <Image
                                                            src={imagePreviewUrl(primary.url, 640)}
                                                            alt={`${asset.name}主参考图`}
                                                            rootClassName="!block !size-full"
                                                            className="!size-full !object-cover"
                                                            preview={{ src: imagePreviewUrl(primary.url, 1920) }}
                                                        />
                                                    ) : (
                                                        <ImagePlus className="size-7 text-muted-foreground" />
                                                    )}
                                                    {!primary ? <span className="absolute bottom-2 rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground">待补主参考图</span> : null}
                                                </div>
                                                <div className="p-3">
                                                    <div className="flex min-w-0 items-center gap-2">
                                                        <Icon className="size-4 shrink-0 text-muted-foreground" />
                                                        <h3 className="min-w-0 flex-1 truncate font-medium" title={asset.name}>
                                                            {asset.name}
                                                        </h3>
                                                        <Tooltip title="编辑设定">
                                                            <Button type="text" size="small" shape="circle" icon={<Edit2 className="size-3.5" />} onClick={() => setEditor({ kind: assetKind, asset: cloneAsset(asset) })} aria-label={`编辑${meta.label}`} />
                                                        </Tooltip>
                                                    </div>
                                                    <p className="mt-1 line-clamp-2 min-h-10 text-xs leading-5 text-muted-foreground">{asset.description || "未填写文字设定"}</p>
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        <Button size="small" icon={<Sparkles className="size-3.5" />} loading={busyKey === `asset:${asset.id}`} onClick={() => void generateAssetReference(asset)}>
                                                            AI 生图
                                                        </Button>
                                                        <Button size="small" icon={<Upload className="size-3.5" />} onClick={() => setEditor({ kind: assetKind, asset: cloneAsset(asset) })}>
                                                            上传
                                                        </Button>
                                                        <Button size="small" icon={<LibraryBig className="size-3.5" />} disabled={!primary} onClick={() => void saveToLibrary(asset, assetKind, meta.label, messageApi)}>
                                                            加入素材库
                                                        </Button>
                                                    </div>
                                                    {references.length ? (
                                                        <div className="mt-3 flex gap-1.5 overflow-x-auto pb-0.5" aria-label="参考图候选">
                                                            {references.map((reference) => {
                                                                const isPrimary = reference.id === primary?.id;
                                                                return (
                                                                    <div
                                                                        key={reference.id}
                                                                        className={`group/reference relative size-11 shrink-0 overflow-hidden rounded border ${isPrimary ? "border-foreground ring-1 ring-foreground/20" : "border-border"}`}
                                                                    >
                                                                        <button type="button" className="block size-full" onClick={() => void setPrimary(asset, reference)} title={isPrimary ? "当前主参考图" : "设为主参考图"}>
                                                                            <img src={imagePreviewUrl(reference.url, 128)} alt={reference.label} className="size-full object-cover" />
                                                                        </button>
                                                                        {isPrimary ? (
                                                                            <span className="absolute left-0 top-0 grid size-4 place-items-center bg-foreground text-background">
                                                                                <Check className="size-2.5" />
                                                                            </span>
                                                                        ) : null}
                                                                        <button
                                                                            type="button"
                                                                            className="absolute bottom-0 right-0 grid size-4 place-items-center bg-background/90 text-muted-foreground opacity-0 transition group-hover/reference:opacity-100 hover:text-rose-600"
                                                                            onClick={() => void removeReference(asset, reference.id)}
                                                                            aria-label="删除参考图"
                                                                        >
                                                                            <Trash2 className="size-2.5" />
                                                                        </button>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : null}
                                                    <div className="mt-3 border-t border-border pt-2.5">
                                                        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                            <Video className="size-3.5" /> 影响分镜 {affected.length}
                                                        </div>
                                                        {affected.length ? (
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {affected.map((shot) => (
                                                                    <div key={shot.id} className="inline-flex max-w-full items-center rounded border border-border bg-muted/35 text-xs">
                                                                        <button type="button" className="truncate px-2 py-1 hover:bg-muted" onClick={() => onLocateShot(shot.episodeId, shot.id)}>
                                                                            #{shot.shotNumber}
                                                                        </button>
                                                                        <button
                                                                            type="button"
                                                                            className="border-l border-border px-1.5 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                                                            onClick={() => void regenerateShot(shot)}
                                                                            disabled={busyKey === `shot:${shot.id}`}
                                                                            aria-label={`重生成分镜 ${shot.shotNumber}`}
                                                                        >
                                                                            {busyKey === `shot:${shot.id}` ? <span className="text-[10px]">...</span> : <Sparkles className="size-3" />}
                                                                        </button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className="text-xs text-muted-foreground">尚未关联分镜</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="flex min-h-32 items-center justify-center rounded-md border border-dashed border-border bg-muted/20 text-sm text-muted-foreground">暂未提取{ASSET_META[assetKind].label}，可先从剧本提取或手动新增</div>
                            )}
                        </div>
                    ),
                }))}
            />

            <AssetEditorModal
                editor={editor}
                busy={busyKey.startsWith("upload:")}
                uploadInputRef={uploadInputRef}
                onClose={() => setEditor(undefined)}
                onChange={(asset) => setEditor((current) => (current ? { ...current, asset } : current))}
                onSave={() => void saveEditor()}
                onUpload={() => uploadInputRef.current?.click()}
                onUploadFile={(file) => void uploadReference(file)}
            />
            {libraryOpen ? <DramaLabAssetLibraryPicker key={kind} kind={kind} label={definition.label} busyKey={busyKey} onClose={() => setLibraryOpen(false)} onImport={importLibraryAsset} /> : null}
        </div>
    );
}

function AssetEditorModal({
    editor,
    busy,
    uploadInputRef,
    onClose,
    onChange,
    onSave,
    onUpload,
    onUploadFile,
}: {
    editor?: EditorState;
    busy: boolean;
    uploadInputRef: RefObject<HTMLInputElement | null>;
    onClose: () => void;
    onChange: (asset: VisualAsset) => void;
    onSave: () => void;
    onUpload: () => void;
    onUploadFile: (file?: File) => void;
}) {
    const asset = editor?.asset;
    const label = editor ? ASSET_META[editor.kind].label : "资产";
    if (!asset) return null;
    const profile = asset.profile || EMPTY_PROFILE;
    return (
        <Modal
            title={asset.id ? `编辑${label}` : `新增${label}`}
            open
            footer={
                <div className="flex justify-between">
                    <Button icon={<Upload className="size-3.5" />} loading={busy} onClick={onUpload}>
                        上传参考图
                    </Button>
                    <div className="flex gap-2">
                        <Button onClick={onClose}>取消</Button>
                        <Button type="primary" onClick={onSave}>
                            保存
                        </Button>
                    </div>
                </div>
            }
            onCancel={onClose}
            destroyOnHidden
        >
            <div className="grid gap-3">
                <label className="grid gap-1.5 text-sm">
                    <span>{label}名称</span>
                    <Input value={asset.name} onChange={(event) => onChange({ ...asset, name: event.target.value })} />
                </label>
                <label className="grid gap-1.5 text-sm">
                    <span>文字设定</span>
                    <Input.TextArea rows={3} value={asset.description || ""} onChange={(event) => onChange({ ...asset, description: event.target.value })} />
                </label>
                {editor ? <DramaLabAssetDetailFields kind={editor.kind} asset={asset} onChange={onChange} /> : null}
                {editor?.kind === "characters" ? (
                    <label className="grid gap-1.5 text-sm">
                        <span>人物外貌</span>
                        <Input.TextArea rows={3} value={asset.appearance || ""} onChange={(event) => onChange({ ...asset, appearance: event.target.value })} />
                    </label>
                ) : null}
                <label className="grid gap-1.5 text-sm">
                    <span>生图提示词</span>
                    <Input.TextArea rows={3} value={asset.imagePrompt || ""} onChange={(event) => onChange({ ...asset, imagePrompt: event.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                    {(["visualIdentity", "styling", "colorPalette", "consistencyRules"] as const).map((key) => (
                        <label key={key} className="grid gap-1.5 text-sm">
                            <span>{profileLabel(key)}</span>
                            <Input value={profile[key]} onChange={(event) => onChange({ ...asset, profile: { ...profile, [key]: event.target.value } })} />
                        </label>
                    ))}
                </div>
            </div>
            <input ref={uploadInputRef} className="hidden" type="file" accept="image/*" onChange={(event) => onUploadFile(event.target.files?.[0])} />
        </Modal>
    );
}

function createAsset(kind: AssetKind, asset: Partial<VisualAsset> & { id: string; name: string; description: string }) {
    const common = { ...asset, profile: asset.profile || { ...EMPTY_PROFILE } };
    return kind === "scenes" ? ({ ...common, location: (asset as Scene).location || asset.name } as Scene) : (common as Character | Prop);
}

function cloneAsset(asset: VisualAsset): VisualAsset {
    return { ...asset, profile: asset.profile ? { ...asset.profile } : { ...EMPTY_PROFILE }, references: dramaAssetReferences(asset).map((reference) => ({ ...reference })) } as VisualAsset;
}

function referenceFromUrl(url: string, source: DramaLabAssetReference["source"], label: string, storageKey?: string, width?: number, height?: number): DramaLabAssetReference {
    return { id: `reference-${nanoid()}`, url, storageKey, source, label, width, height, createdAt: new Date().toISOString() };
}

function imageResultsToReferences(result: ImageGenerationResult & { results?: ImageGenerationResult[] }) {
    const images = result.results?.length ? result.results : [result];
    return images.flatMap((image, index) => {
        const url = stableImageUrl(image);
        return url ? [referenceFromUrl(url, "generated", images.length > 1 ? `AI 候选图 ${index + 1}` : "AI 候选图", undefined, image.width, image.height)] : [];
    });
}

function stableImageUrl(image: ImageGenerationResult) {
    return [image.serverUrl, image.remoteUrl, image.dataUrl].find((value) => Boolean(value?.trim()))?.trim();
}

function shotAssetIds(shot: Shot) {
    return [shot.sceneId, ...shot.characterIds, ...(shot.propIds || [])].filter((value): value is string => Boolean(value));
}

async function saveToLibrary(asset: VisualAsset, kind: AssetKind, label: string, messageApi: MessageInstance) {
    const primary = dramaAssetPrimaryReference(asset);
    if (!primary) return;
    try {
        await createLibraryAsset({
            kind: "image",
            title: assetName(asset),
            coverUrl: primary.url,
            tags: ["短剧", label],
            source: "创作工坊",
            note: asset.description || "",
            metadata: { ...readDramaLabAssetVisualDetails(asset), source: "drama-lab", dramaAssetType: kind === "characters" ? "character" : kind === "scenes" ? "scene" : "prop" },
            data: {
                dataUrl: primary.url,
                storageKey: primary.storageKey,
                serverUrl: primary.url.startsWith("/") ? primary.url : undefined,
                remoteUrl: /^https?:\/\//i.test(primary.url) ? primary.url : undefined,
                width: primary.width || 1,
                height: primary.height || 1,
                bytes: 0,
                mimeType: "image/png",
            },
        });
        messageApi.success("已加入素材库");
    } catch (error) {
        messageApi.error(error instanceof Error ? error.message : "加入素材库失败");
    }
}

function profileLabel(key: keyof DramaLabAssetProfile) {
    return { visualIdentity: "视觉识别", styling: "造型与材质", colorPalette: "固定色彩", consistencyRules: "一致性规则" }[key];
}

function assetName(asset: VisualAsset) {
    return asset.name || ("location" in asset ? asset.location : "");
}
