"use client";

import type { DramaAssetVisualDetails } from "@/lib/drama-project-contract";
import { buildDramaLabAssetImagePrompt, readDramaLabAssetVisualDetails } from "@/lib/drama-lab-asset-image-prompt";
import { normalizeDramaAssetGenerationLayout } from "@/lib/drama-asset-generation-contract";

import { Button, Image, Input, Modal, Tabs, Tooltip } from "antd";
import type { MessageInstance } from "antd/es/message/interface";
import { Check, Edit2, ImagePlus, LibraryBig, MapPin, Package, PanelsTopLeft, Plus, Sparkles, Trash2, Upload, Users, Video } from "lucide-react";
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
    onOpenCanvasHref,
    messageApi,
}: {
    project: Project;
    episode?: Episode;
    onSave: (updates: ProjectUpdate) => Promise<boolean>;
    onReload: () => Promise<void>;
    onLocateShot: (episodeId: string, shotId: string) => void;
    onOpenCanvasHref: (assetType: "character" | "scene" | "prop", assetId: string) => string;
    messageApi: MessageInstance;
}) {
    const config = useEffectiveConfig();
    const uploadInputRef = useRef<HTMLInputElement>(null);
    const [kind, setKind] = useState<AssetKind>("characters");
    const [editor, setEditor] = useState<EditorState>();
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [busyKey, setBusyKey] = useState("");
    const [impactModalAsset, setImpactModalAsset] = useState<VisualAsset>();

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
        const saved = await replaceAssets((current) => current.map((asset) => (asset.id === assetId ? { ...asset, ...patch } : asset)));
        if (saved) setEditor((current) => (current?.asset?.id === assetId ? { ...current, asset: { ...current.asset, ...patch } } : current));
        return saved;
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
        if (!added.length) return false;
        const currentReferences = dramaAssetReferences(asset);
        const primary = currentReferences.length ? currentReferences[0] : added[0];
        return updateAsset(asset.id, {
            references: [...currentReferences, ...added],
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

    const removeActiveReference = async () => {
        if (!activeAsset) return;
        const refs = dramaAssetReferences(activeAsset);
        const primary = refs[0];
        if (!primary) return;
        await updateAsset(activeAsset.id, { references: refs.slice(1), primaryReferenceId: refs[1]?.id, referenceImageUrl: refs[1]?.url, referenceStorageKey: refs[1]?.storageKey });
        setEditor((current) => (current?.asset ? { ...current, asset: { ...current.asset, references: refs.slice(1), primaryReferenceId: refs[1]?.id, referenceImageUrl: refs[1]?.url, referenceStorageKey: refs[1]?.storageKey } } : current));
    };

    const uploadReference = async (files?: FileList | File[]) => {
        if (!files || !activeAsset) return;
        const selected = Array.from(files).filter((file) => file.type.startsWith("image/"));
        if (!selected.length) return;
        const requestKey = `upload:${activeAsset.id}`;
        setBusyKey(requestKey);
        try {
            const uploaded = await Promise.all(
                selected.map(async (file) => {
                    const stored = await uploadImage(file);
                    return referenceFromUrl(stored.serverUrl || stored.url, "upload", file.name, stored.storageKey, stored.width, stored.height);
                }),
            );
            const currentReferences = dramaAssetReferences(activeAsset);
            const nextReferences = [...currentReferences, ...uploaded];
            const primary = currentReferences[0] || uploaded[0];
            const patch = { references: nextReferences, primaryReferenceId: primary?.id, referenceImageUrl: primary?.url, referenceStorageKey: primary?.storageKey, imageUrl: primary?.url };
            if (!(await updateAsset(activeAsset.id, patch))) throw new Error("项目保存失败");
            setEditor((current) => (current?.asset ? { ...current, asset: { ...current.asset, ...patch } } : current));
            messageApi.success(`已上传 ${uploaded.length} 张参考图${primary ? "并显示主参考图" : ""}`);
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

    const runAssetAiAction = async (action: "describe" | "prompt" | "anchor" | "stages") => {
        if (!activeAsset || !editor) return;
        const key = `ai:${action}:${activeAsset.id || "new"}`;
        setBusyKey(key);
        try {
            if (!activeAsset.id) throw new Error("请先保存资产，再使用 AI 操作");
            const response = await fetch(`/api/drama-lab/projects/${encodeURIComponent(project.id)}/assets/${encodeURIComponent(activeAsset.id)}/ai`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ kind: editor.kind, action, requestId: `drama-lab-asset-ai:${project.id}:${activeAsset.id}:${action}:${nanoid()}` }),
            });
            const payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string; data?: { appearance?: string; polishedPrompt?: string; profile?: DramaLabAssetProfile; stages?: VisualAsset["stages"] } };
            if (!response.ok || payload.code !== 0 || !payload.data) throw new Error(payload.msg || "资产 AI 操作失败");
            const patch =
                action === "describe"
                    ? { appearance: payload.data.appearance || "" }
                    : action === "prompt"
                      ? { polishedPrompt: payload.data.polishedPrompt || "" }
                      : action === "anchor"
                        ? { profile: { ...EMPTY_PROFILE, ...(payload.data.profile || {}) } }
                        : { stages: payload.data.stages || [] };
            setEditor((current) => (current?.asset ? { ...current, asset: { ...current.asset, ...patch } } : current));
            messageApi.success(action === "describe" ? "参考图描述已提取" : action === "prompt" ? "最终生图提示词已生成" : action === "anchor" ? "视觉锚点已提炼" : "多阶段造型已生成");
        } catch (error) {
            messageApi.error(error instanceof Error ? error.message : "资产 AI 操作失败");
        } finally {
            setBusyKey("");
        }
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
                                            <article key={asset.id} className="flex h-[430px] flex-col overflow-hidden rounded-md border border-border bg-card" data-drama-lab-asset-card={asset.id}>
                                                <div className="relative grid h-44 shrink-0 place-items-center overflow-hidden bg-muted/50">
                                                    {primary?.url ? (
                                                        <Image
                                                            src={imagePreviewUrl(primary.url, 640)}
                                                            alt={`${asset.name}主参考图`}
                                                            rootClassName="!block !size-full"
                                                            className="!size-full !object-contain"
                                                            preview={{ src: imagePreviewUrl(primary.url, 1920) }}
                                                        />
                                                    ) : (
                                                        <ImagePlus className="size-7 text-muted-foreground" />
                                                    )}
                                                    {!primary ? <span className="absolute bottom-2 rounded bg-background/90 px-2 py-1 text-xs text-muted-foreground">待补主参考图</span> : null}
                                                </div>
                                                <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-3">
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
                                                        <Button
                                                            size="small"
                                                            icon={<PanelsTopLeft className="size-3.5" />}
                                                            href={onOpenCanvasHref(assetKind === "characters" ? "character" : assetKind === "scenes" ? "scene" : "prop", asset.id)}
                                                            aria-label="在画布查看"
                                                            title="在画布查看"
                                                        >
                                                            在画布查看
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
                                                                            <img src={imagePreviewUrl(reference.url, 128)} alt={reference.label} className="size-full object-contain" />
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
                                                    <div className="mt-auto border-t border-border pt-2.5">
                                                        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                                                            <Video className="size-3.5" /> 影响分镜 {affected.length}
                                                        </div>
                                                        {affected.length ? (
                                                            <Tooltip title={<span>关联分镜：{affected.map((shot) => `#${shot.shotNumber}`).join("、")}</span>} placement="topLeft">
                                                                <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                                                                    {affected.slice(0, 3).map((shot) => (
                                                                        <button
                                                                            key={shot.id}
                                                                            type="button"
                                                                            className="shrink-0 rounded border border-border bg-muted/35 px-2 py-1 text-xs hover:bg-muted"
                                                                            onClick={() => onLocateShot(shot.episodeId, shot.id)}
                                                                        >
                                                                            #{shot.shotNumber}
                                                                        </button>
                                                                    ))}
                                                                    {affected.length > 3 ? (
                                                                        <button type="button" className="shrink-0 px-1 py-1 text-xs text-primary hover:underline" onClick={() => setImpactModalAsset(asset)}>
                                                                            ··· 更多（{affected.length - 3}）
                                                                        </button>
                                                                    ) : null}
                                                                </div>
                                                            </Tooltip>
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
                busy={busyKey.startsWith("upload:") || busyKey.startsWith("ai:")}
                uploadInputRef={uploadInputRef}
                onClose={() => setEditor(undefined)}
                onChange={(asset) => setEditor((current) => (current ? { ...current, asset } : current))}
                onSave={() => void saveEditor()}
                onUpload={() => uploadInputRef.current?.click()}
                onUploadFile={(files) => void uploadReference(files)}
                onAiAction={(action) => void runAssetAiAction(action)}
                onRemoveReference={() => void removeActiveReference()}
                onSetPrimary={(reference) => (activeAsset ? void setPrimary(activeAsset, reference) : undefined)}
                onRemoveReferenceById={(referenceId) => (activeAsset ? void removeReference(activeAsset, referenceId) : undefined)}
            />
            {libraryOpen ? <DramaLabAssetLibraryPicker key={kind} kind={kind} label={definition.label} busyKey={busyKey} onClose={() => setLibraryOpen(false)} onImport={importLibraryAsset} /> : null}
            {impactModalAsset ? (
                <Modal open title={`${impactModalAsset.name} · 关联分镜（${(assetShots.get(impactModalAsset.id) || []).length}）`} footer={null} onCancel={() => setImpactModalAsset(undefined)} width={760}>
                    <div className="space-y-3">
                        <p className="text-sm text-muted-foreground">显示该资产关联分镜的全部信息。点击任意一项后关闭弹窗，并定位到分镜工作台对应镜头。</p>
                        <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                            {(assetShots.get(impactModalAsset.id) || []).map((shot) => {
                                const imageUrl = shot.storyboardImageUrl || shot.imageUrl || shot.frames?.key?.url;
                                return (
                                    <button
                                        key={shot.id}
                                        type="button"
                                        className="flex w-full items-center gap-3 rounded-md border border-border p-2 text-left transition-colors hover:bg-muted/50"
                                        onClick={() => {
                                            setImpactModalAsset(undefined);
                                            onLocateShot(shot.episodeId, shot.id);
                                        }}
                                    >
                                        <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded bg-muted/50 text-xs text-muted-foreground">
                                            {imageUrl ? <img src={imagePreviewUrl(imageUrl, 160)} alt={`分镜 ${shot.shotNumber}`} className="size-full object-cover" /> : `分镜图 #${shot.shotNumber}`}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="truncate text-sm font-medium">
                                                #{shot.shotNumber} · {shot.title || shot.location || "未命名分镜"}
                                            </div>
                                            <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{shot.script || shot.description || "暂无分镜摘要"}</div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </Modal>
            ) : null}
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
    onAiAction,
    onRemoveReference,
    onSetPrimary,
    onRemoveReferenceById,
}: {
    editor?: EditorState;
    busy: boolean;
    uploadInputRef: RefObject<HTMLInputElement | null>;
    onClose: () => void;
    onChange: (asset: VisualAsset) => void;
    onSave: () => void;
    onUpload: () => void;
    onUploadFile: (files?: FileList | File[]) => void;
    onAiAction: (action: "describe" | "prompt" | "anchor" | "stages") => void;
    onRemoveReference: () => void;
    onSetPrimary: (reference: DramaLabAssetReference) => void;
    onRemoveReferenceById: (referenceId: string) => void;
}) {
    const asset = editor?.asset;
    const label = editor ? ASSET_META[editor.kind].label : "资产";
    if (!asset) return null;
    const profile = asset.profile || EMPTY_PROFILE;
    const references = dramaAssetReferences(asset);
    const hasReference = references.length > 0;
    const primary = dramaAssetPrimaryReference(asset);
    const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        const files = Array.from(event.dataTransfer.files || []);
        if (files.length) onUploadFile(files);
    };
    const descriptionLabel = editor.kind === "characters" ? "简介" : "文字设定";
    if (editor.kind === "props") {
        return (
            <Modal
                title={asset.id ? "编辑道具" : "新增道具"}
                open
                width={820}
                styles={{ body: { maxHeight: "min(72vh, 680px)", overflowY: "auto", padding: "16px 20px 12px" } }}
                footer={
                    <div className="flex justify-end gap-2">
                        <Button onClick={onClose}>取消</Button>
                        <Button type="primary" onClick={onSave}>
                            保存
                        </Button>
                    </div>
                }
                onCancel={onClose}
                destroyOnHidden
            >
                <div className="grid gap-3">
                    <div className="border-b border-border pb-3">
                        <div className="mb-2 text-xs text-muted-foreground">参考图</div>
                        <div className="flex flex-wrap items-start gap-2">
                            {references.map((reference) => {
                                const isPrimary = reference.id === asset.primaryReferenceId || (!asset.primaryReferenceId && reference.id === primary?.id);
                                return (
                                    <div key={reference.id} className="group relative w-[88px]">
                                        <Image src={imagePreviewUrl(reference.url, 180)} width={88} height={88} preview={{ src: reference.url }} alt={reference.label || "道具参考图"} className="rounded object-cover" />
                                        <div className="mt-1 flex flex-col gap-1">
                                            <Button size="small" type={isPrimary ? "primary" : "default"} onClick={() => onSetPrimary(reference)}>
                                                {isPrimary ? "主参考图" : "设为主图"}
                                            </Button>
                                            <Button size="small" danger onClick={() => onRemoveReferenceById(reference.id)}>
                                                移除
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                            <div
                                className="grid h-[88px] w-[88px] cursor-pointer place-items-center rounded border border-dashed border-border bg-muted text-xs text-muted-foreground"
                                onClick={onUpload}
                                onDragOver={(event) => event.preventDefault()}
                                onDrop={handleDrop}
                                title="点击或拖入参考图"
                            >
                                + 上传
                            </div>
                        </div>
                        {hasReference ? (
                            <Button size="small" type="primary" className="mt-2" onClick={() => onAiAction("describe")} loading={busy}>
                                提取特征描述
                            </Button>
                        ) : null}
                    </div>
                    <label className="grid gap-1.5 text-sm">
                        <span>名称</span>
                        <Input value={asset.name} onChange={(event) => onChange({ ...asset, name: event.target.value })} />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                        <span>类型</span>
                        <Input value={(asset as Prop).type || ""} onChange={(event) => onChange({ ...asset, type: event.target.value } as VisualAsset)} />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                        <span>描述</span>
                        <Input.TextArea rows={3} value={asset.description || ""} onChange={(event) => onChange({ ...asset, description: event.target.value })} />
                    </label>
                    <label className="grid gap-1.5 text-sm">
                        <span className="flex items-center justify-between gap-3">
                            <span>图生提示词</span>
                            <span className="text-xs font-normal text-muted-foreground">AI 润色后的图片提示词，生成图片时直接使用；可手动修改</span>
                        </span>
                        <Button size="small" className="justify-self-end" onClick={() => onAiAction("prompt")} loading={busy}>
                            重新生成提示词
                        </Button>
                        <Input.TextArea rows={5} value={asset.polishedPrompt || asset.imagePrompt || ""} onChange={(event) => onChange({ ...asset, polishedPrompt: event.target.value })} />
                    </label>
                </div>
                <input ref={uploadInputRef} className="hidden" type="file" accept="image/*" multiple onChange={(event) => onUploadFile(Array.from(event.target.files || []))} />
            </Modal>
        );
    }
    return (
        <Modal
            title={asset.id ? `编辑${label}` : `新增${label}`}
            open
            width="min(960px, calc(100vw - 32px))"
            styles={{ body: { maxHeight: "calc(100vh - 160px)", overflowY: "auto", paddingRight: 8 } }}
            footer={
                <div className="flex justify-end gap-2">
                    <Button onClick={onClose}>取消</Button>
                    <Button type="primary" onClick={onSave}>
                        保存
                    </Button>
                </div>
            }
            onCancel={onClose}
            destroyOnHidden
        >
            <div className="grid gap-3">
                <div className="grid grid-cols-[112px_1fr] items-start gap-4 border-b border-border pb-4">
                    <div
                        className="grid size-28 cursor-pointer place-items-center overflow-hidden rounded border border-dashed border-border bg-muted text-xs text-muted-foreground hover:border-primary hover:text-primary"
                        onClick={onUpload}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={handleDrop}
                        title="点击或拖入参考图"
                    >
                        {primary?.url ? (
                            <Image src={imagePreviewUrl(primary.url, 240)} alt={`${label}参考图`} width={112} height={112} preview={{ src: primary.url }} className="!size-full !object-cover" />
                        ) : (
                            <>
                                参考图
                                <br />
                                <span>点击或拖入参考图</span>
                            </>
                        )}
                    </div>
                    <div className="flex flex-col items-start gap-2 pt-1">
                        {hasReference ? (
                            <Button size="small" className="!border-primary/40 !text-primary" onClick={() => onAiAction("describe")} loading={busy}>
                                从参考图提取描述
                            </Button>
                        ) : null}
                        {hasReference ? (
                            <Button size="small" danger onClick={onRemoveReference}>
                                移除参考图
                            </Button>
                        ) : null}
                    </div>
                </div>
                <label className="grid gap-1.5 text-sm">
                    <span>名称</span>
                    <Input value={asset.name} onChange={(event) => onChange({ ...asset, name: event.target.value })} />
                </label>
                {editor ? <DramaLabAssetDetailFields kind={editor.kind} asset={asset} onChange={onChange} /> : null}
                {editor?.kind === "characters" ? (
                    <label className="grid gap-1.5 text-sm">
                        <span>外貌描述</span>
                        <Input.TextArea rows={3} value={asset.appearance || ""} onChange={(event) => onChange({ ...asset, appearance: event.target.value })} placeholder="用于 AI 生成图像的外貌描述，尽量详细" />
                    </label>
                ) : null}
                <label className="grid gap-1.5 text-sm">
                    <span>{descriptionLabel}</span>
                    <Input.TextArea rows={3} value={asset.description || ""} onChange={(event) => onChange({ ...asset, description: event.target.value })} placeholder="角色背景简介，供剧本生成参考" />
                </label>
                <label className="grid gap-1.5 text-sm">
                    <span className="flex items-center justify-between">
                        <span>
                            图生提示词 <span className="text-xs font-normal text-muted-foreground">AI 润色后的最终提示词，生成四视图图片时直接使用；可手动修改</span>
                        </span>
                        <Button size="small" onClick={() => onAiAction("prompt")} loading={busy}>
                            重新生成提示词
                        </Button>
                    </span>
                    <Input.TextArea rows={7} value={asset.polishedPrompt || ""} onChange={(event) => onChange({ ...asset, polishedPrompt: event.target.value })} placeholder="点击“重新生成提示词”由 AI 自动生成，或直接在此输入" />
                </label>
                <label className="grid gap-1.5 text-sm">
                    <span className="flex items-center justify-between">
                        <span>
                            视觉锚点 <span className="text-xs font-normal text-muted-foreground">AI 从外貌描述/参考图提炼的视觉特征，用于保持生成图片角色一致性</span>
                        </span>
                        <Button size="small" onClick={() => onAiAction("anchor")} loading={busy}>
                            提炼视觉锚点
                        </Button>
                    </span>
                    <Input.TextArea
                        rows={5}
                        value={JSON.stringify(profile, null, 2)}
                        onChange={(event) => onChange({ ...asset, profile: parseAnchorProfile(event.target.value, profile) })}
                        placeholder='{"visualIdentity":"...","styling":"...","colorPalette":"...","consistencyRules":"..."}'
                    />
                </label>
                {editor?.kind === "characters" ? (
                    <label className="grid gap-1.5 text-sm">
                        <span className="flex items-center justify-between">
                            <span>
                                多阶段造型 <span className="text-xs font-normal text-muted-foreground">不同集次的角色造型变化，格式：JSON 数组</span>
                            </span>
                            <Button size="small" onClick={() => onAiAction("stages")} loading={busy}>
                                AI 生成造型
                            </Button>
                        </span>
                        <Input.TextArea rows={4} value={JSON.stringify(asset.stages || [], null, 2)} onChange={(event) => onChange({ ...asset, stages: parseStages(event.target.value) })} placeholder='[{"episode_range":[1,3],"appearance":"..."}]' />
                    </label>
                ) : null}
            </div>
            <input ref={uploadInputRef} className="hidden" type="file" accept="image/*" multiple onChange={(event) => onUploadFile(event.target.files || undefined)} />
        </Modal>
    );
}

function createAsset(kind: AssetKind, asset: Partial<VisualAsset> & { id: string; name: string; description: string }) {
    const common = { ...asset, profile: asset.profile || { ...EMPTY_PROFILE }, generationLayout: normalizeDramaAssetGenerationLayout(kind, asset.generationLayout) };
    return kind === "scenes" ? ({ ...common, location: (asset as Scene).location || asset.name } as Scene) : (common as Character | Prop);
}

function cloneAsset(asset: VisualAsset): VisualAsset {
    return { ...asset, profile: asset.profile ? { ...asset.profile } : { ...EMPTY_PROFILE }, references: dramaAssetReferences(asset).map((reference) => ({ ...reference })), generationLayout: asset.generationLayout } as VisualAsset;
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

function assetName(asset: VisualAsset) {
    return asset.name || ("location" in asset ? asset.location : "");
}

function parseAnchorProfile(value: string, fallback: DramaLabAssetProfile): DramaLabAssetProfile {
    try {
        const parsed = JSON.parse(value) as Partial<DramaLabAssetProfile>;
        return {
            visualIdentity: typeof parsed.visualIdentity === "string" ? parsed.visualIdentity : fallback.visualIdentity,
            styling: typeof parsed.styling === "string" ? parsed.styling : fallback.styling,
            colorPalette: typeof parsed.colorPalette === "string" ? parsed.colorPalette : fallback.colorPalette,
            consistencyRules: typeof parsed.consistencyRules === "string" ? parsed.consistencyRules : fallback.consistencyRules,
        };
    } catch {
        return fallback;
    }
}

function parseStages(value: string) {
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed.filter((item) => Array.isArray(item?.episodeRange) && item.episodeRange.length === 2 && typeof item.appearance === "string") : [];
    } catch {
        return [];
    }
}
