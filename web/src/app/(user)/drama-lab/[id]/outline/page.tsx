"use client";

import { use, useState, useEffect, useCallback, useRef, type ChangeEvent, type MouseEvent } from "react";
import { Button, Input, Select, Form, Card, Empty, Modal, message, Tabs, Upload as AntUpload, Steps, Table, Image as AntImage } from "antd";
import { ArrowLeft, ChevronDown, Plus, Trash2, Edit2, Play, Users, MapPin, Package, Search, Upload, LibraryBig, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DramaLabAssetLibraryPicker } from "../drama-lab-asset-library-picker";
import type { Asset } from "@/lib/library-asset-contract";
import styleGroups from "@/lib/drama-lab-style-options.json";

import { uploadImage } from "@/services/image-storage";
import { createImageGenerationTask, waitForImageGenerationTask } from "@/services/api/image";
import { useEffectiveConfig } from "@/stores/use-config-store";
import { buildResourceImageRequest, normalizeResourceGenerationReferences, setResourcePrimaryImage } from "./resource-image-generation";
import type { ReferenceImage } from "@/types/image";

const { TextArea } = Input;
const { Option } = Select;

interface Episode {
    id: string;
    title: string;
    number?: number;
    episodeNumber?: number;
    script: string;
    status?: string;
    storyboardCount?: number;
    shots?: unknown[];
}

interface Character {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    referenceImageUrl?: string;
    referenceStorageKey?: string;
    references?: Array<{ id?: string; url?: string; storageKey?: string; role?: string }>;
    category?: string;
    tags?: string[];
    prompt?: string;
}

interface Scene {
    id: string;
    name?: string;
    location: string;
    time?: string;
    description?: string;
    imageUrl?: string;
    referenceImageUrl?: string;
    referenceStorageKey?: string;
    references?: Array<{ id?: string; url?: string; storageKey?: string; role?: string }>;
    category?: string;
    tags?: string[];
    prompt?: string;
}

interface Prop {
    id: string;
    name: string;
    description?: string;
    imageUrl?: string;
    referenceImageUrl?: string;
    referenceStorageKey?: string;
    references?: Array<{ id?: string; url?: string; storageKey?: string; role?: string }>;
    category?: string;
    tags?: string[];
    prompt?: string;
}

type LooseAssetData = { storageKey?: string; serverUrl?: string; remoteUrl?: string; dataUrl?: string; content?: string; url?: string };
type LooseAssetReference = { role?: string; url?: string };
type LooseAsset = {
    referenceImageUrl?: string;
    imageUrl?: string;
    coverUrl?: string;
    location?: string;
    name?: string;
    data?: LooseAssetData;
    references?: LooseAssetReference[];
    note?: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
};
type LooseEpisode = Partial<Episode> & { script_content?: unknown; reviewStatus?: unknown; shotCount?: unknown; status?: unknown };

interface Project {
    id: string;
    title: string;
    description?: string;
    style?: string;
    aspectRatio?: string;
    episodes: Episode[];
    characters: Character[];
    scenes: Scene[];
    props: Prop[];
    clues: unknown[];
    defaultVideoMode?: string;
}

type StyleOption = { label: string; value: string; prompt?: string; promptEn?: string; thumb?: string };
type StyleGroup = { label: string; options: StyleOption[] };
type ProjectSettingsFormValues = { title?: string; description?: string; style?: string; aspectRatio?: string };
const STYLE_GROUPS = styleGroups as StyleGroup[];

function assetImageUrl(asset: LooseAsset | Asset | null | undefined): string | undefined {
    if (!asset || typeof asset !== "object") return undefined;
    const source = asset as LooseAsset;
    const references = Array.isArray(source.references) ? source.references : [];
    const data = source.data && typeof source.data === "object" ? source.data : {};
    return source.referenceImageUrl || source.imageUrl || data.serverUrl || data.remoteUrl || data.dataUrl || source.coverUrl || references.find((reference) => reference?.role === "primary")?.url || references[0]?.url || undefined;
}

function normalizeEpisode(value: LooseEpisode, index: number): Episode {
    const shots = Array.isArray(value?.shots) ? value.shots : [];
    const number = Number(value?.episodeNumber || value?.number || index + 1);
    return {
        id: typeof value.id === "string" ? value.id : `episode_${crypto.randomUUID()}`,
        title: typeof value.title === "string" ? value.title : `第 ${number} 集`,
        number,
        episodeNumber: number,
        script: typeof value?.script === "string" ? value.script : typeof value?.script_content === "string" ? value.script_content : "",
        status: typeof value?.status === "string" ? value.status : typeof value?.reviewStatus === "string" ? value.reviewStatus : "draft",
        storyboardCount: Number(value?.storyboardCount ?? value?.shotCount ?? shots.length ?? 0),
        shots,
    };
}
function parseChapters(text: string, pattern: string) {
    const normalized = text.replace(/\r\n/g, "\n").trim();
    if (!normalized) return [];
    let regex: RegExp;
    try {
        regex = new RegExp(pattern.trim(), "gm");
    } catch {
        throw new Error("章节正则格式不正确");
    }
    const matches = [...normalized.matchAll(regex)];
    if (!matches.length) throw new Error("未匹配到章节，请调整章节正则");
    return matches.map((match, index) => {
        const title = String(match[1] || match[0] || `第${index + 1}章`).trim();
        const start = match.index || 0;
        const contentStart = start + String(match[0] || "").length;
        const end = index + 1 < matches.length ? matches[index + 1].index || normalized.length : normalized.length;
        return { title, content: normalized.slice(contentStart, end).trim() };
    });
}

function groupChapters(chapters: Array<{ title: string; content: string }>, perEpisode: number, startNumber: number) {
    const size = Math.max(1, Math.floor(perEpisode || 1));
    return Array.from({ length: Math.ceil(chapters.length / size) }, (_, index) => {
        const chunk = chapters.slice(index * size, index * size + size);
        return {
            episodeNumber: startNumber + index,
            title: chunk.length === 1 ? chunk[0].title : `第${startNumber + index}集`,
            script: chunk.map((chapter) => `${chapter.title}\n${chapter.content}`).join("\n\n"),
            chapterTitles: chunk.map((chapter) => chapter.title),
        };
    });
}

async function readBatchImportFile(projectId: string, file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("commit", "false");
    const response = await fetch(`/api/drama-lab/projects/${projectId}/import-novel`, { method: "POST", body: form });
    const payload = (await response.json().catch(() => ({}))) as { code?: number; msg?: string; data?: { sourceText?: string } };
    if (!response.ok || payload.code !== 0 || typeof payload.data?.sourceText !== "string") throw new Error(payload.msg || "文件解析失败");
    return payload.data.sourceText;
}

export default function ProjectOutlinePage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
    const params = use(paramsPromise);
    const projectId = encodeURIComponent(params.id);
    const router = useRouter();
    const [project, setProject] = useState<Project | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [form] = Form.useForm();
    const autoSaveTimerRef = useRef<number | undefined>(undefined);
    const imageConfig = useEffectiveConfig();
    const [resourceEditor, setResourceEditor] = useState<{ kind: "characters" | "scenes" | "props"; asset: Character | Scene | Prop }>();
    const [resourceBusy, setResourceBusy] = useState(false);
    const resourceFileInput = useRef<HTMLInputElement>(null);
    const resourcePrimaryFileInput = useRef<HTMLInputElement>(null);
    const [resourcePreview, setResourcePreview] = useState<{ url: string; title: string }>();
    const [resourceMentionOpen, setResourceMentionOpen] = useState(false);
    const [activeTab, setActiveTab] = useState("characters");
    const [batchImportOpen, setBatchImportOpen] = useState(false);
    const [batchImportText, setBatchImportText] = useState("");
    const [batchImportTab, setBatchImportTab] = useState<"config" | "preview">("config");
    const [selectedStyle, setSelectedStyle] = useState("");
    const [batchFileName, setBatchFileName] = useState("");
    const [batchRawText, setBatchRawText] = useState("");
    const [chapterPattern, setChapterPattern] = useState("^\\s*(第[0-9０-９零一二三四五六七八九十百千万]+[章回节][^\\n\\r]*)");
    const [chaptersPerEpisode, setChaptersPerEpisode] = useState(1);
    const [previewChapters, setPreviewChapters] = useState<Array<{ title: string; content: string }>>([]);
    const [previewEpisodes, setPreviewEpisodes] = useState<Array<{ episodeNumber: number; title: string; script: string; chapterTitles: string[] }>>([]);
    const [stylePickerOpen, setStylePickerOpen] = useState(false);
    const [styleSearch, setStyleSearch] = useState("");
    const [resourceImportOpen, setResourceImportOpen] = useState(false);
    const [resourceImportTarget, setResourceImportTarget] = useState("characters");
    const [libraryKeyword, setLibraryKeyword] = useState("");
    const selectedStyleOption = STYLE_GROUPS.flatMap((group) => group.options).find((option) => option.value === selectedStyle || option.label === selectedStyle);

    // 加载项目
    const loadProject = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`/api/drama-lab/projects/${projectId}`);
            const data = await res.json();

            if (data.code !== 0 || !data.data?.project) {
                throw new Error(data.msg || "加载失败");
            }

            const proj = data.data.project;
            const projectData: Project = {
                id: proj.id,
                title: proj.title,
                description: proj.summary || "",
                style: proj.style || "",
                aspectRatio: proj.ratio || "16:9",
                episodes: (proj.episodes || []).map(normalizeEpisode),
                characters: (proj.characters || []).map((asset: Character) => ({ ...asset, imageUrl: assetImageUrl(asset) })),
                scenes: (proj.scenes || []).map((asset: Scene) => ({ ...asset, location: asset.location || asset.name || "未命名场景", imageUrl: assetImageUrl(asset) })),
                props: (proj.props || []).map((asset: Prop) => ({ ...asset, imageUrl: assetImageUrl(asset) })),
                clues: proj.clues || [],
                defaultVideoMode: proj.defaultVideoMode,
            };

            setProject(projectData);
            setSelectedStyle(projectData.style || "");
            form.setFieldsValue({
                title: projectData.title,
                description: projectData.description,
                style: projectData.style,
                aspectRatio: projectData.aspectRatio,
            });
        } catch (err) {
            message.error(err instanceof Error ? err.message : "加载失败");
            router.push("/drama-lab");
        } finally {
            setLoading(false);
        }
    }, [projectId, form, router]);

    useEffect(() => {
        void loadProject();
    }, [loadProject]);

    const persistProject = async (changes: Partial<Project>) => {
        if (!project) return false;
        const next = { ...project, ...changes };
        const res = await fetch(`/api/drama-lab/projects/${projectId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                title: next.title,
                summary: next.description,
                style: next.style,
                ratio: next.aspectRatio,
                episodes: next.episodes,
                characters: next.characters,
                scenes: next.scenes,
                props: next.props,
                clues: next.clues,
                defaultVideoMode: next.defaultVideoMode || "first_last",
            }),
        });
        if (!res.ok) throw new Error("保存失败");
        setProject(next);
        return true;
    };

    const handleBatchImport = async () => {
        if (!project) return;
        try {
            const source = (batchRawText || batchImportText).trim();
            if (!source) {
                message.warning("请先选择 TXT 文件或输入剧集内容");
                return;
            }
            const chapters =
                !source.includes("|") && /第|章|回|节/.test(source) && chapterPattern.trim()
                    ? parseChapters(source, chapterPattern)
                    : source
                          .split(/\r?\n/)
                          .map((line) => line.trim())
                          .filter(Boolean)
                          .map((line) => {
                              const [title, ...rest] = line.split(/\s*\|\s*/);
                              return { title: title || "未命名剧集", content: rest.join(" | ") };
                          });
            setPreviewChapters(chapters);
            setPreviewEpisodes(groupChapters(chapters, chaptersPerEpisode, project.episodes.length + 1));
            setBatchImportTab("preview");
        } catch (error) {
            message.error(error instanceof Error ? error.message : "剧本解析失败");
        }
    };

    const confirmBatchImport = async () => {
        if (!project || !previewEpisodes.length) return;
        try {
            const episodes = previewEpisodes.map((episode, index) =>
                normalizeEpisode(
                    {
                        id: `ep_${Date.now()}_${index}`,
                        title: episode.title,
                        episodeNumber: episode.episodeNumber,
                        script: episode.script,
                        status: "draft",
                        shots: [],
                    },
                    project.episodes.length + index,
                ),
            );
            await persistProject({ episodes: [...project.episodes, ...episodes] });
            setBatchImportText("");
            setBatchRawText("");
            setBatchFileName("");
            setPreviewEpisodes([]);
            setPreviewChapters([]);
            setBatchImportTab("config");
            setBatchImportOpen(false);
            message.success(`已导入 ${episodes.length} 集`);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "批量导入失败");
        }
    };

    const openResourceImport = (target: string) => {
        setResourceImportTarget(target);
        setLibraryKeyword("");
        setResourceImportOpen(true);
    };

    const handleResourceImport = async (asset: Asset): Promise<boolean> => {
        if (!project) return false;
        const source = asset as unknown as LooseAsset;
        const imageUrl = assetImageUrl(source);
        const common = {
            description: asset.note || "",
            imageUrl,
            referenceImageUrl: imageUrl,
            referenceStorageKey: source.data?.storageKey,
            references: imageUrl ? [{ id: `ref_${Date.now()}`, url: imageUrl, storageKey: source.data?.storageKey, role: "primary" }] : [],
            category: typeof asset.metadata?.category === "string" ? asset.metadata.category : "",
            tags: asset.tags || [],
            prompt: typeof asset.metadata?.prompt === "string" ? asset.metadata.prompt : "",
        };
        try {
            if (resourceImportTarget === "characters") await persistProject({ characters: [...project.characters, { id: `character_${Date.now()}`, name: asset.title, ...common }] });
            else if (resourceImportTarget === "scenes") await persistProject({ scenes: [...project.scenes, { id: `scene_${Date.now()}`, name: asset.title, location: asset.title, time: "", ...common } as Scene] });
            else await persistProject({ props: [...project.props, { id: `prop_${Date.now()}`, name: asset.title, ...common }] });
            message.success(`已导入素材：${asset.title}`);
            return true;
        } catch (error) {
            message.error(error instanceof Error ? error.message : "素材导入失败");
            return false;
        }
    };

    const updateResourceAsset = (update: (asset: Character | Scene | Prop) => Character | Scene | Prop) => setResourceEditor((current) => (current ? { ...current, asset: update(current.asset) } : current));

    const uploadResourcePrimaryImage = async (file?: File) => {
        if (!resourceEditor || !file || !file.type.startsWith("image/")) return;
        setResourceBusy(true);
        try {
            const stored = await uploadImage(file);
            const url = stored.serverUrl || stored.url;
            updateResourceAsset((asset) => ({
                ...asset,
                imageUrl: url,
                referenceImageUrl: url,
                referenceStorageKey: stored.storageKey,
                references: [...(assetImageUrl(asset) ? [{ id: `history-${Date.now()}`, url: assetImageUrl(asset), role: "history" }] : []), ...(asset.references || []).filter((item) => item.role !== "primary")],
            }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "主图替换失败");
        } finally {
            setResourceBusy(false);
            if (resourcePrimaryFileInput.current) resourcePrimaryFileInput.current.value = "";
        }
    };

    const uploadResourceReferences = async (files: File[]) => {
        if (!resourceEditor || !files.length) return;
        const existing = normalizeResourceGenerationReferences(resourceEditor.asset.references || []);
        const accepted = files.filter((file) => file.type.startsWith("image/")).slice(0, Math.max(0, 9 - existing.length));
        if (!accepted.length) {
            message.warning(existing.length >= 9 ? "最多支持 9 张参考图" : "请选择图片文件");
            return;
        }
        setResourceBusy(true);
        try {
            const uploaded = await Promise.all(accepted.map(uploadImage));
            updateResourceAsset((asset) => ({
                ...asset,
                references: [...(asset.references || []), ...uploaded.map((stored, index) => ({ id: `reference-${Date.now()}-${index}`, url: stored.serverUrl || stored.url, storageKey: stored.storageKey, role: "reference" }))],
            }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "上传失败");
        } finally {
            setResourceBusy(false);
            if (resourceFileInput.current) resourceFileInput.current.value = "";
        }
    };

    const generateResourceImage = async () => {
        if (!resourceEditor || !project) return;
        setResourceBusy(true);
        try {
            const request = buildResourceImageRequest(resourceEditor.asset.description || "", resourceEditor.asset.references || []);
            const references: ReferenceImage[] = request.references.map((reference, index) => ({
                id: reference.id || `reference-${index + 1}`,
                name: reference.label,
                type: "image",
                dataUrl: reference.url || "",
                url: reference.url,
                serverUrl: reference.url,
                storageKey: reference.storageKey,
            }));
            const config = { ...imageConfig, model: imageConfig.imageModel || imageConfig.model, count: "1" };
            const task = await createImageGenerationTask(config, request.prompt, references, undefined, {
                surface: "drama",
                projectId: project.id,
                logSource: "drama",
                logTitle: `${project.title} · 资源设定图`,
            });
            const results = await waitForImageGenerationTask(config, task);
            const result = results.results?.[0] || results;
            const url = result?.serverUrl || result?.remoteUrl || result?.dataUrl;
            if (!url) throw new Error("生成未返回图片地址");
            updateResourceAsset((asset) => ({
                ...asset,
                imageUrl: url,
                referenceImageUrl: url,
                references: [...(assetImageUrl(asset) ? [{ id: `history-${Date.now()}`, url: assetImageUrl(asset), role: "history" }] : []), ...(asset.references || []).filter((item) => item.role !== "primary")],
            }));
        } catch (error) {
            message.error(error instanceof Error ? error.message : "生成失败");
        } finally {
            setResourceBusy(false);
        }
    };

    // 保存项目信息
    const saveProjectInfo = async (silent = false, overrides: Partial<ProjectSettingsFormValues> = {}) => {
        if (!project) return;

        setSaving(true);
        try {
            // `style` is driven by the visual picker instead of a named Form.Item,
            // so read the complete form store and accept the just-picked value.
            const values = form.getFieldsValue(true) as ProjectSettingsFormValues;
            const title = (typeof overrides.title === "string" ? overrides.title : typeof values.title === "string" ? values.title : project.title).trim();
            const description = typeof overrides.description === "string" ? overrides.description : typeof values.description === "string" ? values.description : project.description || "";
            const style = (typeof overrides.style === "string" ? overrides.style : values.style || selectedStyle || project.style || "").trim();
            const aspectRatio = (typeof overrides.aspectRatio === "string" ? overrides.aspectRatio : typeof values.aspectRatio === "string" ? values.aspectRatio : project.aspectRatio || "16:9").trim();
            const res = await fetch(`/api/drama-lab/projects/${projectId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title,
                    summary: description,
                    style,
                    ratio: aspectRatio,
                    episodes: project.episodes,
                    characters: project.characters,
                    scenes: project.scenes,
                    props: project.props,
                    clues: project.clues,
                    defaultVideoMode: project.defaultVideoMode || "first_last",
                }),
            });

            const data = await res.json();
            if (data.code !== 0) throw new Error(data.msg || "保存失败");

            setProject({
                ...project,
                title,
                description,
                style,
                aspectRatio,
            });
            setSelectedStyle(style);

            if (!silent) message.success("保存成功");
        } catch (err) {
            message.error(err instanceof Error ? err.message : "保存失败");
        } finally {
            setSaving(false);
        }
    };

    const scheduleProjectSettingsSave = (overrides: Partial<ProjectSettingsFormValues> = {}) => {
        if (autoSaveTimerRef.current !== undefined) window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = window.setTimeout(() => {
            autoSaveTimerRef.current = undefined;
            void saveProjectInfo(true, overrides);
        }, 700);
    };

    const selectStyle = (style: string, closePicker = true) => {
        const nextStyle = style.trim();
        form.setFieldValue("style", nextStyle);
        setSelectedStyle(nextStyle);
        if (closePicker) setStylePickerOpen(false);
        scheduleProjectSettingsSave({ style: nextStyle });
    };

    useEffect(
        () => () => {
            if (autoSaveTimerRef.current !== undefined) window.clearTimeout(autoSaveTimerRef.current);
        },
        [],
    );

    // 添加分集
    const handleAddEpisode = async () => {
        if (!project) return;

        const newEpisode: Episode = {
            id: `ep_${Date.now()}`,
            title: `第 ${project.episodes.length + 1} 集`,
            number: project.episodes.length + 1,
            script: "",
            status: "draft",
            storyboardCount: 0,
        };

        const updatedEpisodes = [...project.episodes, newEpisode];

        try {
            const res = await fetch(`/api/drama-lab/projects/${projectId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: project.title,
                    summary: project.description,
                    style: project.style,
                    ratio: project.aspectRatio,
                    episodes: updatedEpisodes,
                    characters: project.characters,
                    scenes: project.scenes,
                    props: project.props,
                    clues: project.clues,
                    defaultVideoMode: project.defaultVideoMode || "first_last",
                }),
            });

            if (res.ok) {
                setProject({ ...project, episodes: updatedEpisodes });
                message.success("添加成功");
            }
        } catch (err) {
            message.error("添加失败");
        }
    };

    // 删除分集
    const handleDeleteEpisode = (episodeId: string) => {
        if (!project) return;

        Modal.confirm({
            title: "确认删除",
            content: "确定要删除这一集吗？",
            onOk: async () => {
                const updatedEpisodes = project.episodes.filter((ep) => ep.id !== episodeId);

                try {
                    const res = await fetch(`/api/drama-lab/projects/${projectId}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            episodes: updatedEpisodes,
                            characters: project.characters,
                            scenes: project.scenes,
                            props: project.props,
                        }),
                    });

                    if (res.ok) {
                        setProject({ ...project, episodes: updatedEpisodes });
                        message.success("删除成功");
                    }
                } catch (err) {
                    message.error("删除失败");
                }
            },
        });
    };

    // 进入制作
    const goToCreate = (episodeId: string) => {
        router.push(`/drama-lab/${projectId}/create?episode=${encodeURIComponent(episodeId)}`);
    };

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="text-center">
                    <div className="mb-2 text-lg">加载中...</div>
                </div>
            </div>
        );
    }

    if (!project) {
        return null;
    }

    return (
        <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto bg-background">
            {/* 顶部导航 */}
            <header className="sticky top-0 z-10 border-b border-border bg-card">
                <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
                    <div className="flex items-center gap-4">
                        <Link href="/drama-lab" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                            <ArrowLeft className="size-4" />
                            返回列表
                        </Link>
                        <span className="text-muted-foreground">›</span>
                        <h1 className="text-lg font-semibold">{project.title}</h1>
                    </div>
                    <Button type="primary" icon={<Play className="size-4" />} onClick={() => project.episodes[0] && goToCreate(project.episodes[0].id)} disabled={!project.episodes.length}>
                        进入制作
                    </Button>
                </div>
            </header>

            {/* 主内容 */}
            <main className="mx-auto max-w-7xl space-y-6 p-6">
                {/* 剧集信息 */}
                <Card title="剧集信息">
                    <Form form={form} layout="vertical" onValuesChange={scheduleProjectSettingsSave}>
                        <div className="grid grid-cols-1 gap-x-6 gap-y-1 md:grid-cols-2">
                            <Form.Item label="标题" name="title" rules={[{ required: true }]}>
                                <Input placeholder="剧集标题" />
                            </Form.Item>
                            <Form.Item label="图片/视频风格">
                                <button
                                    type="button"
                                    aria-label="选择图片或视频风格"
                                    className="flex h-10 w-full items-center gap-2 rounded-md border border-input bg-background px-2 text-left text-sm shadow-xs transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                                    onClick={() => setStylePickerOpen(true)}
                                >
                                    <span className="grid size-6 shrink-0 overflow-hidden rounded-sm bg-muted">
                                        {selectedStyleOption?.thumb ? <img src={selectedStyleOption.thumb} alt="" className="size-full object-cover" /> : <span className="size-full bg-gradient-to-br from-violet-300 via-primary/60 to-slate-700" />}
                                    </span>
                                    <span className={selectedStyle ? "min-w-0 flex-1 truncate text-foreground" : "min-w-0 flex-1 truncate text-muted-foreground"}>{selectedStyleOption?.label || selectedStyle || "选择生成风格"}</span>
                                    <ChevronDown className="ml-auto size-4 shrink-0 text-muted-foreground" aria-hidden />
                                </button>
                            </Form.Item>
                            <Form.Item label="画面比例" name="aspectRatio">
                                <Select>
                                    <Option value="16:9">16:9 横屏（默认）</Option>
                                    <Option value="9:16">9:16 竖屏（短视频）</Option>
                                    <Option value="3:4">3:4 竖版</Option>
                                    <Option value="1:1">1:1 方形</Option>
                                    <Option value="4:3">4:3 传统横屏</Option>
                                    <Option value="21:9">21:9 宽银幕</Option>
                                </Select>
                            </Form.Item>
                        </div>
                        <Form.Item label="故事梗概" name="description">
                            <TextArea rows={3} placeholder="一句话描述故事梗概" />
                        </Form.Item>
                        <p className="-mt-2 text-xs text-muted-foreground">设置会在停止输入后自动保存。</p>
                    </Form>
                </Card>

                {/* 分集列表 */}
                <Card
                    title={
                        <div className="flex items-center justify-between">
                            <span>
                                分集列表 <span className="text-sm text-muted-foreground">共 {project.episodes.length} 集</span>
                            </span>
                            <div className="flex items-center gap-2">
                                <Button icon={<Upload className="size-4" />} onClick={() => setBatchImportOpen(true)}>
                                    批量导入剧集
                                </Button>
                                <Button type="primary" icon={<Plus className="size-4" />} onClick={handleAddEpisode}>
                                    新增一集
                                </Button>
                            </div>
                        </div>
                    }
                >
                    {project.episodes.length === 0 ? (
                        <Empty description="暂无分集，点击「新增一集」开始创作" />
                    ) : (
                        <div className="grid grid-cols-3 gap-4">
                            {project.episodes.map((ep) => (
                                <div key={ep.id} className="group cursor-pointer rounded-lg border border-border p-4 transition-all hover:border-primary hover:shadow-md" onClick={() => goToCreate(ep.id)}>
                                    <div className="mb-2 flex items-center justify-between">
                                        <span className="text-sm text-muted-foreground">第 {ep.episodeNumber || ep.number || 0} 集</span>
                                        <Button
                                            type="text"
                                            size="small"
                                            danger
                                            icon={<Trash2 className="size-3" />}
                                            onClick={(e: MouseEvent<HTMLButtonElement>) => {
                                                e.stopPropagation();
                                                handleDeleteEpisode(ep.id);
                                            }}
                                        />
                                    </div>
                                    <h3 className="mb-2 text-base font-semibold">{ep.title}</h3>
                                    <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">{ep.script ? ep.script.slice(0, 50) + "..." : "暂无剧本"}</p>
                                    <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
                                        <span>{ep.storyboardCount ?? ep.shots?.length ?? 0} 分镜</span>
                                        <span className="rounded bg-muted px-2 py-0.5">{ep.status === "draft" ? "草稿" : "进行中"}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-primary opacity-0 transition-opacity group-hover:opacity-100">
                                        <Play className="size-4" />
                                        进入制作
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </Card>

                {/* 资源库预览 */}
                <Card
                    title="本剧资源库"
                    extra={
                        <div className="flex items-center gap-2">
                            <Input
                                allowClear
                                prefix={<Search className="size-4 text-muted-foreground" />}
                                placeholder="搜索本剧资源"
                                className="w-52"
                                value={libraryKeyword}
                                onChange={(event: ChangeEvent<HTMLInputElement>) => setLibraryKeyword(event.target.value)}
                            />
                            <Button icon={<LibraryBig className="size-4" />} onClick={() => void openResourceImport(activeTab)}>
                                从素材库导入
                            </Button>
                        </div>
                    }
                >
                    <Tabs
                        activeKey={activeTab}
                        onChange={setActiveTab}
                        items={(["characters", "scenes", "props"] as const).map((kind) => ({
                            key: kind,
                            label: `${kind === "characters" ? "角色" : kind === "scenes" ? "场景" : "道具"} (${project[kind].length})`,
                            children: (
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                    {project[kind]
                                        .filter((asset) => !libraryKeyword.trim() || (asset.name || ("location" in asset ? asset.location : "")).includes(libraryKeyword.trim()))
                                        .map((asset) => (
                                            <div key={asset.id} className="group relative h-72 overflow-hidden rounded-lg border border-border" data-outline-resource-card={asset.id}>
                                                <button type="button" className="flex h-full w-full flex-col text-left" onClick={() => setResourceEditor({ kind, asset: { ...asset } })}>
                                                    <div className="h-40 w-full shrink-0 bg-muted">
                                                        {assetImageUrl(asset) ? (
                                                            <div className="size-full" onClick={(event) => event.stopPropagation()} data-outline-resource-preview>
                                                                <AntImage src={assetImageUrl(asset)} alt={asset.name || "参考图"} width="100%" height="100%" className="!size-full !object-contain" preview={{ src: assetImageUrl(asset) }} />
                                                            </div>
                                                        ) : (
                                                            <div className="grid size-full place-items-center text-xs text-muted-foreground">暂无参考图</div>
                                                        )}
                                                    </div>
                                                    <div className="overflow-hidden p-3">
                                                        <div className="mb-2 truncate font-semibold">{asset.name || ("location" in asset ? asset.location : "")}</div>
                                                        <div className="line-clamp-3 text-xs text-muted-foreground">{asset.description || "暂无描述"}</div>
                                                    </div>
                                                </button>
                                                <button
                                                    type="button"
                                                    aria-label="删除本剧资源"
                                                    className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-background opacity-0 group-hover:opacity-100 focus:opacity-100 max-sm:opacity-100"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        Modal.confirm({
                                                            title: "删除确认",
                                                            content: `确定删除「${asset.name || "此资源"}」？`,
                                                            okText: "删除",
                                                            cancelText: "取消",
                                                            okButtonProps: { danger: true },
                                                            onOk: async () => {
                                                                await persistProject({ [kind]: project[kind].filter((item) => item.id !== asset.id) });
                                                            },
                                                        });
                                                    }}
                                                >
                                                    <X className="size-4" />
                                                </button>
                                            </div>
                                        ))}
                                </div>
                            ),
                        }))}
                    />
                </Card>
            </main>

            <Modal open={batchImportOpen} title="批量导入剧集" width={900} footer={null} onCancel={() => setBatchImportOpen(false)}>
                <Steps current={batchImportTab === "config" ? 0 : 1} items={[{ title: "导入设置" }, { title: "预览确认" }]} className="mb-5" />
                {batchImportTab === "config" ? (
                    <div className="grid gap-4">
                        <AntUpload.Dragger
                            beforeUpload={(file: File) => {
                                setBatchFileName(file.name);
                                void readBatchImportFile(projectId, file)
                                    .then((content) => {
                                        setBatchRawText(content);
                                        setBatchImportText(content);
                                    })
                                    .catch((error) => message.error(error instanceof Error ? error.message : "文件解析失败"));
                                return false;
                            }}
                            showUploadList={false}
                            accept=".txt,.md,.markdown,.docx,.doc,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword"
                        >
                            <p className="ant-upload-drag-icon">
                                <Upload className="mx-auto size-7 text-muted-foreground" />
                            </p>
                            <p className="ant-upload-text">点击或拖拽上传 TXT / MD / DOCX / DOC 文件</p>
                            <p className="ant-upload-hint">支持小说原文或剧本文档，也可以直接在下面粘贴文本。</p>
                        </AntUpload.Dragger>
                        <div className="grid gap-3">
                            <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3">
                                <span className="text-left text-sm">章节正则</span>
                                <Input value={chapterPattern} onChange={(event: ChangeEvent<HTMLInputElement>) => setChapterPattern(event.target.value)} />
                            </div>
                            <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3">
                                <span className="text-left text-sm">每集章节数</span>
                                <div className="flex items-center">
                                    <Button size="small" onClick={() => setChaptersPerEpisode((value) => Math.max(1, value - 1))}>
                                        −
                                    </Button>
                                    <span className="grid h-8 w-14 place-items-center border-y border-border text-sm">{chaptersPerEpisode}</span>
                                    <Button size="small" onClick={() => setChaptersPerEpisode((value) => Math.min(100, value + 1))}>
                                        ＋
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <div
                            className="rounded-md border border-dashed border-border p-2"
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={(event) => {
                                event.preventDefault();
                                const file = event.dataTransfer.files?.[0];
                                if (!file) return;
                                setBatchFileName(file.name);
                                void readBatchImportFile(projectId, file)
                                    .then((content) => {
                                        setBatchRawText(content);
                                        setBatchImportText(content);
                                    })
                                    .catch((error) => message.error(error instanceof Error ? error.message : "文件解析失败"));
                            }}
                        >
                            <Input.TextArea
                                rows={8}
                                value={batchRawText || batchImportText}
                                onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
                                    setBatchRawText(event.target.value);
                                    setBatchImportText(event.target.value);
                                }}
                                placeholder={"第1章 雨夜里，主角收到一封神秘来信。\n\n第2章 他沿着线索来到旧车站。"}
                            />
                        </div>
                        <div className="rounded-md bg-muted/40 p-3 text-xs leading-6 text-muted-foreground">
                            <div>支持 TXT、MD、DOCX、DOC 小说原文或剧本文档，服务器会自动解析编码与 Word 内容。</div>
                            <div>也可以直接粘贴文本，或将文件拖到弹窗、文件区、正文输入框。</div>
                            <div>请输入可匹配章节标题的正则表达式；默认支持“第1章 / 第1集 / 第 一 章”等标题。</div>
                            <div>
                                示例：<code className="text-primary">^\s*(第\d+章[^\n]*)</code>、<code className="text-primary">^\s*(第\d+集[^\n]*)</code>
                            </div>
                            <div>每集章节数可自由设置；例如设置为 3，则每 3 个识别章节合并为 1 集。</div>
                        </div>
                        <div className="flex justify-end">
                            <Button type="primary" onClick={() => void handleBatchImport()}>
                                解析并预览
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="grid gap-4">
                        <div className="text-sm text-muted-foreground">
                            共识别 {previewChapters.length} 个章节，预计导入 {previewEpisodes.length} 集
                        </div>
                        <Table
                            rowKey="episodeNumber"
                            size="small"
                            pagination={false}
                            dataSource={previewEpisodes}
                            columns={[
                                { title: "集数", dataIndex: "episodeNumber", width: 80 },
                                { title: "标题", dataIndex: "title" },
                                { title: "章节", render: (_: unknown, row: (typeof previewEpisodes)[number]) => row.chapterTitles.join("、") },
                                { title: "剧本预览", render: (_: unknown, row: (typeof previewEpisodes)[number]) => row.script.slice(0, 100) },
                            ]}
                            scroll={{ y: 360 }}
                        />
                        <div className="flex justify-end gap-2">
                            <Button onClick={() => setBatchImportTab("config")}>返回设置</Button>
                            <Button type="primary" onClick={() => void confirmBatchImport()}>
                                确认导入集数
                            </Button>
                        </div>
                    </div>
                )}
            </Modal>
            <Modal open={stylePickerOpen} title="选择生成风格" width={900} footer={<Button onClick={() => setStylePickerOpen(false)}>完成</Button>} onCancel={() => setStylePickerOpen(false)}>
                <div className="mb-4 flex items-center gap-3">
                    <Input.Search allowClear placeholder="搜索风格名称" value={styleSearch} onChange={(event: ChangeEvent<HTMLInputElement>) => setStyleSearch(event.target.value)} />
                    <span className="shrink-0 text-sm text-muted-foreground">已选：{form.getFieldValue("style") || "未选择"}</span>
                </div>
                <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
                    {STYLE_GROUPS.map((group) => {
                        const options = group.options.filter((option) => !styleSearch.trim() || option.label.toLowerCase().includes(styleSearch.trim().toLowerCase()) || option.value.toLowerCase().includes(styleSearch.trim().toLowerCase()));
                        if (!options.length) return null;
                        return (
                            <section key={group.label}>
                                <h3 className="mb-2 text-sm font-semibold">{group.label}</h3>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                    {options.map((option) => {
                                        const selected = form.getFieldValue("style") === option.value;
                                        return (
                                            <button
                                                type="button"
                                                key={option.value}
                                                className={`overflow-hidden rounded-lg border text-left transition ${selected ? "border-primary ring-2 ring-primary/30" : "border-border hover:border-primary/60"}`}
                                                onClick={() => selectStyle(option.value)}
                                            >
                                                <div className="aspect-[4/3] bg-muted">
                                                    {option.thumb ? (
                                                        <img src={option.thumb} alt={option.label} className="size-full object-cover" />
                                                    ) : (
                                                        <div className="grid size-full place-items-center text-xs text-muted-foreground">{option.label.slice(0, 2)}</div>
                                                    )}
                                                </div>
                                                <div className="flex items-center justify-between p-2 text-sm">
                                                    <span>{option.label}</span>
                                                    {selected ? <span className="text-primary">✓</span> : null}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        );
                    })}
                    <section>
                        <h3 className="mb-2 text-sm font-semibold">其他</h3>
                        <Input
                            placeholder="自定义风格描述，输入后保存"
                            value={selectedStyle && !STYLE_GROUPS.some((group) => group.options.some((option) => option.value === selectedStyle)) ? selectedStyle : ""}
                            onChange={(event: ChangeEvent<HTMLInputElement>) => {
                                selectStyle(event.target.value, false);
                            }}
                        />
                    </section>
                </div>
            </Modal>

            <Modal
                open={Boolean(resourceEditor)}
                title={`编辑${resourceEditor?.kind === "characters" ? "角色" : resourceEditor?.kind === "scenes" ? "场景" : "道具"}库`}
                width={560}
                maskClosable={!resourceBusy}
                closable={!resourceBusy}
                onCancel={() => {
                    if (!resourceBusy) setResourceEditor(undefined);
                }}
                footer={
                    <>
                        <Button disabled={resourceBusy} onClick={() => setResourceEditor(undefined)}>
                            取消
                        </Button>
                        <Button
                            type="primary"
                            loading={resourceBusy}
                            onClick={async () => {
                                if (!resourceEditor || !project) return;
                                if (!resourceEditor.asset.name?.trim()) {
                                    message.error("请输入名称");
                                    return;
                                }
                                setResourceBusy(true);
                                try {
                                    const { kind, asset } = resourceEditor;
                                    await persistProject({ [kind]: project[kind].map((item) => (item.id === asset.id ? { ...asset, ...(kind === "scenes" ? { location: asset.name } : {}) } : item)) });
                                    setResourceEditor(undefined);
                                } catch {
                                    message.error("保存失败");
                                } finally {
                                    setResourceBusy(false);
                                }
                            }}
                        >
                            保存
                        </Button>
                    </>
                }
            >
                {resourceEditor ? (
                    <div className="max-h-[65vh] overflow-y-auto py-3">
                        <div className="mb-4 grid grid-cols-[3rem_minmax(0,1fr)] gap-4">
                            <span className="pt-2">主图</span>
                            <div className="flex min-w-0 gap-2">
                                <div
                                    className="group relative flex h-44 min-w-0 flex-1 items-center justify-center overflow-hidden rounded border bg-muted transition-colors hover:border-primary"
                                    onDragOver={(event) => {
                                        event.preventDefault();
                                        event.dataTransfer.dropEffect = "copy";
                                    }}
                                    onDrop={(event) => {
                                        event.preventDefault();
                                        void uploadResourcePrimaryImage(event.dataTransfer.files?.[0]);
                                    }}
                                >
                                    <button
                                        type="button"
                                        className="flex size-full items-center justify-center"
                                        onClick={() => assetImageUrl(resourceEditor.asset) && setResourcePreview({ url: assetImageUrl(resourceEditor.asset) || "", title: "当前主图" })}
                                    >
                                        {assetImageUrl(resourceEditor.asset) ? <img src={assetImageUrl(resourceEditor.asset)} alt="主图" className="max-h-full max-w-full object-contain" /> : "暂无主图"}
                                    </button>
                                    <button
                                        type="button"
                                        className="absolute inset-x-3 bottom-3 rounded-md bg-black/70 px-3 py-2 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
                                        onClick={() => resourcePrimaryFileInput.current?.click()}
                                    >
                                        上传图片 / 替换主图
                                    </button>
                                </div>
                                <div className="max-h-44 w-20 shrink-0 space-y-2 overflow-y-auto pr-1" aria-label="AI 生成历史图">
                                    {(resourceEditor.asset.references || [])
                                        .filter((reference) => reference.role === "history" && reference.url)
                                        .map((reference, index) => (
                                            <div key={reference.id || `${reference.url}-${index}`} className="group relative h-12 overflow-hidden rounded border">
                                                <button
                                                    type="button"
                                                    className="size-full"
                                                    aria-label="设为主图"
                                                    onClick={() => {
                                                        const result = setResourcePrimaryImage(assetImageUrl(resourceEditor.asset), resourceEditor.asset.references || [], reference);
                                                        updateResourceAsset((asset) => ({ ...asset, imageUrl: result.primaryUrl, referenceImageUrl: result.primaryUrl, references: result.references }));
                                                    }}
                                                >
                                                    <img src={reference.url} alt={`历史图 ${index + 1}`} className="size-full object-cover" />
                                                </button>
                                                <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/45 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
                                                    <button type="button" aria-label="放大历史图" className="rounded bg-white px-1.5 text-xs" onClick={() => setResourcePreview({ url: reference.url || "", title: `历史图 ${index + 1}` })}>
                                                        ⌕
                                                    </button>
                                                    <button
                                                        type="button"
                                                        aria-label="删除历史图"
                                                        className="rounded bg-white px-1.5 text-xs"
                                                        onClick={() => updateResourceAsset((asset) => ({ ...asset, references: (asset.references || []).filter((item) => item.id !== reference.id) }))}
                                                    >
                                                        ×
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>

                            <span className="pt-2">参考</span>
                            <div
                                className="rounded-lg border border-dashed p-2 transition-colors hover:border-primary"
                                onDragOver={(event) => {
                                    event.preventDefault();
                                    event.dataTransfer.dropEffect = "copy";
                                }}
                                onDrop={(event) => {
                                    event.preventDefault();
                                    void uploadResourceReferences(Array.from(event.dataTransfer.files));
                                }}
                            >
                                <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                                    <span>生成图片的参考图</span>
                                    <span>{normalizeResourceGenerationReferences(resourceEditor.asset.references || []).length} / 9</span>
                                </div>
                                <div className="flex min-h-24 gap-2 overflow-x-auto pb-1">
                                    {normalizeResourceGenerationReferences(resourceEditor.asset.references || []).map((reference, index) => (
                                        <div key={reference.id} className="group relative h-24 w-20 shrink-0 overflow-hidden rounded border bg-muted">
                                            <button type="button" className="size-full" aria-label={`预览${reference.label}`} onClick={() => setResourcePreview({ url: reference.url || "", title: reference.label })}>
                                                <img src={reference.url} alt={reference.label} className="size-full object-cover" />
                                                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">{reference.label}</span>
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={`移除${reference.label}`}
                                                className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-white/90 text-xs"
                                                onClick={() => updateResourceAsset((asset) => ({ ...asset, references: (asset.references || []).filter((item) => item.id !== reference.id) }))}
                                            >
                                                ×
                                            </button>
                                        </div>
                                    ))}
                                    {normalizeResourceGenerationReferences(resourceEditor.asset.references || []).length < 9 ? (
                                        <button type="button" className="grid h-24 w-20 shrink-0 place-items-center rounded border border-dashed text-xs text-muted-foreground" onClick={() => resourceFileInput.current?.click()}>
                                            <span>
                                                <b className="block text-xl font-normal">＋</b>拖入或添加
                                            </span>
                                        </button>
                                    ) : null}
                                </div>
                                <div className="mt-2 flex justify-end">
                                    <Button loading={resourceBusy} onClick={() => void generateResourceImage()}>
                                        AI 生成
                                    </Button>
                                </div>
                            </div>
                        </div>
                        <input ref={resourceFileInput} type="file" accept="image/*" multiple hidden onChange={(event) => void uploadResourceReferences(Array.from(event.target.files || []))} />
                        <input ref={resourcePrimaryFileInput} type="file" accept="image/*" hidden onChange={(event) => void uploadResourcePrimaryImage(event.target.files?.[0])} />
                        {(["name", "category", "description", "tags"] as const).map((field) => (
                            <div key={field} className="mb-4 flex items-start gap-4">
                                <label className="w-12 shrink-0 pt-1" htmlFor={`resource-${field}`}>
                                    {{ name: "名称", category: "分类", description: "描述", tags: "标签" }[field]}
                                </label>
                                {field === "description" ? (
                                    <div className="relative min-w-0 flex-1">
                                        <Input.TextArea
                                            id={`resource-${field}`}
                                            disabled={resourceBusy}
                                            rows={4}
                                            placeholder="输入文本提示词。只有图片＝图生图；只有文字＝文生图；图片和文字＝文加图生图。输入 @ 可引用上方参考图，例如：保留 @图1 的脸，使用 @图2 的服装。"
                                            value={resourceEditor.asset.description || ""}
                                            onChange={(event) => {
                                                const value = event.target.value;
                                                setResourceMentionOpen(value.endsWith("@"));
                                                setResourceEditor({ ...resourceEditor, asset: { ...resourceEditor.asset, description: value } });
                                            }}
                                        />
                                        {resourceMentionOpen ? (
                                            <div className="absolute bottom-2 left-2 z-10 w-52 rounded-md border bg-popover p-1 shadow-lg">
                                                {normalizeResourceGenerationReferences(resourceEditor.asset.references || []).map((reference) => (
                                                    <button
                                                        key={reference.id}
                                                        type="button"
                                                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
                                                        onClick={() => {
                                                            const current = resourceEditor.asset.description || "";
                                                            setResourceEditor({ ...resourceEditor, asset: { ...resourceEditor.asset, description: `${current.slice(0, -1)}@${reference.label} ` } });
                                                            setResourceMentionOpen(false);
                                                        }}
                                                    >
                                                        <img src={reference.url} alt="" className="size-8 rounded object-cover" />
                                                        <span>@{reference.label}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        ) : null}
                                    </div>
                                ) : (
                                    <Input
                                        id={`resource-${field}`}
                                        disabled={resourceBusy}
                                        placeholder={field === "tags" ? "逗号分隔" : field === "category" ? "可选" : ""}
                                        value={field === "tags" ? resourceEditor.asset.tags?.join(",") : resourceEditor.asset[field]}
                                        onChange={(event) => setResourceEditor({ ...resourceEditor, asset: { ...resourceEditor.asset, [field]: field === "tags" ? event.target.value.split(/[,，]/) : event.target.value } })}
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                ) : null}
            </Modal>
            <Modal open={Boolean(resourcePreview)} title={resourcePreview?.title || "图片预览"} footer={null} width={760} onCancel={() => setResourcePreview(undefined)}>
                {resourcePreview ? (
                    <div>
                        <div className="flex max-h-[65vh] items-center justify-center overflow-hidden rounded border bg-muted">
                            <img src={resourcePreview.url} alt={resourcePreview.title} className="max-h-[65vh] max-w-full object-contain" />
                        </div>
                        {resourcePreview.title.startsWith("历史图") ? (
                            <div className="mt-3 flex justify-end">
                                <Button
                                    type="primary"
                                    onClick={() => {
                                        const reference = (resourceEditor?.asset.references || []).find((item) => item.url === resourcePreview.url);
                                        if (!resourceEditor || !reference) return;
                                        const result = setResourcePrimaryImage(assetImageUrl(resourceEditor.asset), resourceEditor.asset.references || [], reference);
                                        updateResourceAsset((asset) => ({ ...asset, imageUrl: result.primaryUrl, referenceImageUrl: result.primaryUrl, references: result.references }));
                                        setResourcePreview(undefined);
                                    }}
                                >
                                    设为主图
                                </Button>
                            </div>
                        ) : null}
                    </div>
                ) : null}
            </Modal>
            {resourceImportOpen ? (
                <DramaLabAssetLibraryPicker
                    key={resourceImportTarget}
                    kind={resourceImportTarget as "characters" | "scenes" | "props"}
                    label={resourceImportTarget === "characters" ? "角色" : resourceImportTarget === "scenes" ? "场景" : "道具"}
                    busyKey=""
                    importedNames={project?.[resourceImportTarget as "characters" | "scenes" | "props"].map((asset) => ("name" in asset ? asset.name : asset.location)).filter((name): name is string => Boolean(name)) || []}
                    onClose={() => setResourceImportOpen(false)}
                    onImport={handleResourceImport}
                />
            ) : null}
        </div>
    );
}
