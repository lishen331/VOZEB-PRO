"use client";

import { Drawer, Dropdown, Grid, Input, Modal, Spin, Tooltip } from "antd";
import { ChevronDown, FileAudio, FileText, FolderOpen, ImageIcon, LayoutGrid, LibraryBig, LocateFixed, Plus, RefreshCw, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import type { Asset, AssetKind } from "@/lib/library-asset-contract";
import type { PublicWorkPublication } from "@/services/api/work-publications";
import { IpReferencePicker } from "@/components/ip-library/ip-reference-picker";
import { IP_REFERENCE_ENTRY_VISIBLE } from "@/lib/ip-library-domain";
import { canvasThemes, type CanvasTheme } from "@/lib/canvas-theme";
import { imagePreviewUrl } from "@/lib/media-image-url";
import { listLibraryAssetPage } from "@/services/api/library-assets";
import { listMyPrompts } from "@/services/api/my-prompts";
import { getPublicWorkPublication } from "@/services/api/work-publications";
import { listPublicGallery } from "@/services/api/work-governance";
import { ALL_PROMPTS_OPTION, fetchPrompts, promptCategoryLabel, type Prompt } from "@/services/api/prompts";
import { useCanvasColorTheme } from "@/stores/use-theme-store";
import { useUserStore } from "@/stores/use-user-store";
import { useCanvasStore } from "../stores/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "../types";
import { libraryAssetToInsertPayload, type InsertAssetPayload } from "./canvas-asset-insert";

type PanelTab = "current" | "assets" | "prompts" | "ip";
type AssetSource = "my" | "public";
type PromptSource = "my" | "library";
type CurrentMediaKind = "image" | "video";
type PublicMediaKind = "image" | "video" | "audio";
type CurrentMedia = { id: string; title: string; kind: CurrentMediaKind; url: string };
type PublicCanvasAsset = { id: string; slug: string; title: string; category: string; kind: PublicMediaKind; url: string; mimeType: string };
type VisualMediaPreview = { kind: CurrentMediaKind; title: string; url: string; posterUrl?: string };
type MediaPreview = VisualMediaPreview | { kind: "audio"; title: string; url: string };
type PagedCollection<T> = { items: T[]; page: number; total: number; loading: boolean; loaded: boolean; error: string; categories: string[] };

const emptyCollection = <T,>(): PagedCollection<T> => ({ items: [], page: 0, total: 0, loading: false, loaded: false, error: "", categories: [] });

export function mapPublicWorkAssetsToCanvasItems(work: Pick<PublicWorkPublication, "slug" | "title" | "category" | "assets">): PublicCanvasAsset[] {
    return work.assets
        .filter((asset) => asset.role === "content" && (asset.mediaType === "image" || asset.mediaType === "video" || asset.mediaType === "audio") && Boolean(asset.url))
        .map((asset) => ({ id: `${work.slug}:${asset.id}`, slug: work.slug, title: work.title, category: work.category, kind: asset.mediaType, url: asset.url, mimeType: asset.mimeType }));
}

export function publicCanvasAssetToInsertPayload(asset: PublicCanvasAsset): InsertAssetPayload {
    if (asset.kind === "image") return { kind: "image", title: asset.title, dataUrl: asset.url, remoteUrl: asset.url, externalReference: true };
    if (asset.kind === "video") return { kind: "video", title: asset.title, url: asset.url, remoteUrl: asset.url };
    return { kind: "audio", title: asset.title, url: asset.url, remoteUrl: asset.url };
}

export function collectCanvasPanelMedia(nodes: CanvasNodeData[]): CurrentMedia[] {
    return nodes.reduce<CurrentMedia[]>((items, node) => {
        const url = node.metadata?.content;
        if (!url) return items;
        if (node.type === CanvasNodeType.Image || node.type === CanvasNodeType.Panorama) items.push({ id: node.id, title: node.title || "画布图片", kind: "image", url });
        if (node.type === CanvasNodeType.Video) items.push({ id: node.id, title: node.title || "画布视频", kind: "video", url });
        return items;
    }, []);
}

export function canvasProjectMenuItemStyle(theme: CanvasTheme): CSSProperties {
    return {
        background: "transparent",
        color: theme.node.text,
    };
}

export function CanvasAssetsPanel({
    open,
    projectId,
    projectTitle,
    nodes,
    onOpenProject,
    onOpenProjects,
    onCreateProject,
    onInsertAsset,
    onInsertPrompt,
    onLocateNode,
    onClose,
}: {
    open: boolean;
    projectId: string;
    projectTitle: string;
    nodes: CanvasNodeData[];
    onOpenProject: (id: string) => void;
    onOpenProjects: () => void;
    onCreateProject: () => void;
    onInsertAsset: (payload: InsertAssetPayload) => void;
    onInsertPrompt: (prompt: string) => void;
    onLocateNode: (id: string) => void;
    onClose: () => void;
}) {
    const screens = Grid.useBreakpoint();
    const theme = canvasThemes[useCanvasColorTheme().theme];
    const userId = useUserStore((state) => state.user?.id || "");
    const projectSummaries = useCanvasStore((state) => state.summaries);
    const project = useCanvasStore((state) => state.projects.find((item) => item.id === projectId));
    const updateProject = useCanvasStore((state) => state.updateProject);
    const [activeTab, setActiveTab] = useState<PanelTab>("current");
    const [assetSource, setAssetSource] = useState<AssetSource>("my");
    const [promptSource, setPromptSource] = useState<PromptSource>("my");
    const [assetKind, setAssetKind] = useState<AssetKind | "all">("all");
    const [assetKeyword, setAssetKeyword] = useState("");
    const [assetSearch, setAssetSearch] = useState("");
    const [assets, setAssets] = useState<PagedCollection<Asset>>(emptyCollection);
    const [publicAssets, setPublicAssets] = useState<PagedCollection<PublicCanvasAsset>>(emptyCollection);
    const [publicAssetKind, setPublicAssetKind] = useState<PublicMediaKind | "all">("all");
    const [publicAssetKeyword, setPublicAssetKeyword] = useState("");
    const [publicAssetSearch, setPublicAssetSearch] = useState("");
    const [publicNextCursor, setPublicNextCursor] = useState<string>();
    const [myPrompts, setMyPrompts] = useState<PagedCollection<Prompt>>(emptyCollection);
    const [libraryPrompts, setLibraryPrompts] = useState<PagedCollection<Prompt>>(emptyCollection);
    const [myCategory, setMyCategory] = useState(ALL_PROMPTS_OPTION);
    const [libraryCategory, setLibraryCategory] = useState(ALL_PROMPTS_OPTION);
    const [myKeyword, setMyKeyword] = useState("");
    const [libraryKeyword, setLibraryKeyword] = useState("");
    const [mySearch, setMySearch] = useState("");
    const [librarySearch, setLibrarySearch] = useState("");
    const [preview, setPreview] = useState<MediaPreview>();
    const requestVersions = useRef({ assets: 0, publicAssets: 0, my: 0, library: 0 });
    const currentMedia = useMemo(() => collectCanvasPanelMedia(nodes), [nodes]);

    const loadAssets = useCallback(async (page: number, kind: AssetKind | "all", keyword: string) => {
        const requestId = ++requestVersions.current.assets;
        setAssets((current) => ({ ...current, loading: true, error: "" }));
        try {
            const result = await listLibraryAssetPage({ page, pageSize: 16, kind: kind === "all" ? undefined : kind, keyword });
            if (requestVersions.current.assets !== requestId) return;
            setAssets((current) => ({ items: page === 1 ? result.assets : uniqueById([...current.items, ...result.assets]), page: result.page, total: result.total, loading: false, loaded: true, error: "", categories: [] }));
        } catch (error) {
            if (requestVersions.current.assets !== requestId) return;
            setAssets((current) => ({ ...current, loading: false, loaded: true, error: error instanceof Error ? error.message : "素材加载失败" }));
        }
    }, []);

    const loadPublicAssetPage = useCallback(
        async (cursor?: string, append = false, keyword = publicAssetKeyword) => {
            const requestId = ++requestVersions.current.publicAssets;
            setPublicAssets((current) => ({ ...current, loading: true, error: "" }));
            try {
                const page = await listPublicGallery({ limit: 24, sort: "featured", cursor, keyword: keyword || undefined });
                const works = await Promise.allSettled(page.items.map((item) => getPublicWorkPublication(item.slug)));
                const items = works.flatMap((result) => (result.status === "fulfilled" ? mapPublicWorkAssetsToCanvasItems(result.value) : []));
                if (requestVersions.current.publicAssets !== requestId) return;
                setPublicNextCursor(page.nextCursor);
                setPublicAssets((current) => {
                    const nextItems = append ? uniqueById([...current.items, ...items]) : items;
                    return { items: nextItems, page: append ? current.page + 1 : 1, total: page.nextCursor ? nextItems.length + 1 : nextItems.length, loading: false, loaded: true, error: "", categories: [] };
                });
            } catch (error) {
                if (requestVersions.current.publicAssets !== requestId) return;
                setPublicAssets((current) => ({ ...current, loading: false, loaded: true, error: error instanceof Error ? error.message : "公共素材加载失败" }));
            }
        },
        [publicAssetKeyword],
    );

    const loadPromptPage = useCallback(async (kind: "my" | "library", page: number, category: string, keyword: string) => {
        const requestId = ++requestVersions.current[kind];
        const setCollection = kind === "my" ? setMyPrompts : setLibraryPrompts;
        setCollection((current) => ({ ...current, loading: true, error: "" }));
        try {
            const result = kind === "my" ? await listMyPrompts({ page, category, keyword, includeFacets: page === 1 }) : await fetchPrompts({ page, category, keyword, includeFacets: page === 1 });
            if (requestVersions.current[kind] !== requestId) return;
            setCollection((current) => ({
                items: page === 1 ? result.items : uniqueById([...current.items, ...result.items]),
                page,
                total: result.total,
                loading: false,
                loaded: true,
                error: "",
                categories: page === 1 ? result.categories : current.categories,
            }));
        } catch (error) {
            if (requestVersions.current[kind] !== requestId) return;
            setCollection((current) => ({ ...current, loading: false, loaded: true, error: error instanceof Error ? error.message : "提示词加载失败" }));
        }
    }, []);

    useEffect(() => {
        requestVersions.current = { assets: requestVersions.current.assets + 1, publicAssets: requestVersions.current.publicAssets + 1, my: requestVersions.current.my + 1, library: requestVersions.current.library + 1 };
        setAssets(emptyCollection());
        setPublicAssets(emptyCollection());
        setPublicNextCursor(undefined);
        setMyPrompts(emptyCollection());
        setLibraryPrompts(emptyCollection());
    }, [userId]);

    useEffect(() => {
        if (open && activeTab === "assets" && !assets.loaded && !assets.loading) void loadAssets(1, assetKind, assetKeyword);
    }, [activeTab, assetKind, assetKeyword, assets.loaded, assets.loading, loadAssets, open]);

    useEffect(() => {
        if (!open || activeTab !== "assets" || assetSource !== "public" || publicAssets.loaded || publicAssets.loading) return;
        void loadPublicAssetPage();
    }, [activeTab, assetSource, loadPublicAssetPage, open, publicAssets.loaded, publicAssets.loading]);

    useEffect(() => {
        if (!open || activeTab !== "prompts") return;
        const collection = promptSource === "my" ? myPrompts : libraryPrompts;
        const category = promptSource === "my" ? myCategory : libraryCategory;
        const keyword = promptSource === "my" ? myKeyword : libraryKeyword;
        if (!collection.loaded && !collection.loading) void loadPromptPage(promptSource, 1, category, keyword);
    }, [activeTab, libraryCategory, libraryKeyword, libraryPrompts, loadPromptPage, myCategory, myKeyword, myPrompts, open, promptSource]);

    const projectOptions = useMemo(() => {
        const options = projectSummaries.map((project) => ({ id: project.id, title: project.title, nodeCount: project.nodeCount }));
        if (!options.some((project) => project.id === projectId)) options.unshift({ id: projectId, title: projectTitle, nodeCount: nodes.length });
        return options;
    }, [nodes.length, projectId, projectSummaries, projectTitle]);

    const panel = (
        <div className="flex h-full min-h-0 flex-col" style={{ background: theme.node.panel, color: theme.node.text }} aria-label="Canvas 资产面板" data-testid="canvas-assets-panel">
            <header className="shrink-0 border-b px-3 pb-0 pt-3" style={{ borderColor: theme.toolbar.border }}>
                <div className="mb-3 flex items-center gap-2">
                    <LibraryBig className="size-4" aria-hidden="true" />
                    <h2 className="min-w-0 flex-1 text-sm font-semibold">资产</h2>
                    <Tooltip title="关闭资产面板">
                        <button type="button" className="grid size-8 place-items-center rounded-lg transition hover:opacity-70" onClick={onClose} aria-label="关闭资产面板">
                            <X className="size-4" />
                        </button>
                    </Tooltip>
                </div>
                <div className="mb-2 flex gap-2">
                    <Dropdown
                        trigger={["click"]}
                        menu={{
                            items: [
                                ...projectOptions.map((project) => ({
                                    key: project.id,
                                    style: canvasProjectMenuItemStyle(theme),
                                    label: (
                                        <span className="flex min-w-48 items-center justify-between gap-4" aria-current={project.id === projectId ? "page" : undefined}>
                                            <span className="max-w-40 truncate">{project.title}</span>
                                            <span className="text-xs opacity-45">{project.nodeCount} 节点</span>
                                        </span>
                                    ),
                                })),
                                { type: "divider" as const },
                                { key: "__all__", icon: <LayoutGrid className="size-4" />, label: "全部画布" },
                            ],
                            onClick: ({ key }) => (key === "__all__" ? onOpenProjects() : onOpenProject(key)),
                        }}
                    >
                        <button
                            type="button"
                            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border px-2.5 text-left text-xs font-medium transition hover:opacity-80"
                            style={{ borderColor: theme.toolbar.border, background: theme.toolbar.itemHover, color: theme.node.text }}
                            aria-label="切换画布"
                        >
                            <FolderOpen className="size-3.5 shrink-0" aria-hidden="true" />
                            <span className="min-w-0 flex-1 truncate">{projectTitle}</span>
                            <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
                        </button>
                    </Dropdown>
                    <button
                        type="button"
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition hover:opacity-80"
                        style={{ borderColor: theme.toolbar.border, background: theme.node.panel, color: theme.node.text }}
                        onClick={onCreateProject}
                        aria-label="新建画布"
                    >
                        <Plus className="size-3.5" aria-hidden="true" />
                        新建
                    </button>
                </div>
                <div className={IP_REFERENCE_ENTRY_VISIBLE ? "grid grid-cols-4" : "grid grid-cols-3"} role="tablist" aria-label="资源分类">
                    <PanelTabButton label="当前" active={activeTab === "current"} count={currentMedia.length} onClick={() => setActiveTab("current")} />
                    <PanelTabButton label="素材" active={activeTab === "assets"} count={assets.loaded ? assets.total : undefined} onClick={() => setActiveTab("assets")} />
                    <PanelTabButton label="提示词" active={activeTab === "prompts"} onClick={() => setActiveTab("prompts")} />
                    {IP_REFERENCE_ENTRY_VISIBLE ? <PanelTabButton label="IP" active={activeTab === "ip"} count={project?.ipReferences?.length} onClick={() => setActiveTab("ip")} /> : null}
                </div>
            </header>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {activeTab === "current" ? <CurrentCanvasAssets items={currentMedia} onLocate={onLocateNode} onPreview={setPreview} /> : null}
                {activeTab === "assets" ? (
                    <>
                        <PanelSubTabButtonGroup
                            label="素材来源"
                            value={assetSource}
                            items={[
                                { value: "my", label: "我的素材", count: assets.loaded ? assets.total : undefined },
                                { value: "public", label: "公共素材", count: publicAssets.loaded ? publicAssets.items.length : undefined },
                            ]}
                            onChange={(value) => setAssetSource(value as AssetSource)}
                        />
                        <div className="min-h-0 flex-1 overflow-hidden">
                            {assetSource === "my" ? (
                                <LibraryAssets
                                    collection={assets}
                                    kind={assetKind}
                                    keyword={assetSearch}
                                    onKeywordChange={setAssetSearch}
                                    onSearch={(keyword) => {
                                        requestVersions.current.assets += 1;
                                        setAssetKeyword(keyword);
                                        setAssets(emptyCollection());
                                    }}
                                    onKindChange={(kind) => {
                                        requestVersions.current.assets += 1;
                                        setAssetKind(kind);
                                        setAssets(emptyCollection());
                                    }}
                                    onInsert={(asset) => onInsertAsset(libraryAssetToInsertPayload(asset))}
                                    onPreview={setPreview}
                                    onRetry={() => void loadAssets(1, assetKind, assetKeyword)}
                                    onLoadMore={() => void loadAssets(assets.page + 1, assetKind, assetKeyword)}
                                />
                            ) : (
                                <PublicCanvasAssets
                                    collection={publicAssets}
                                    kind={publicAssetKind}
                                    keyword={publicAssetSearch}
                                    nextCursor={publicNextCursor}
                                    onKeywordChange={setPublicAssetSearch}
                                    onSearch={(keyword) => {
                                        requestVersions.current.publicAssets += 1;
                                        setPublicAssetKeyword(keyword);
                                        setPublicNextCursor(undefined);
                                        setPublicAssets(emptyCollection());
                                    }}
                                    onKindChange={setPublicAssetKind}
                                    onInsert={(asset) => onInsertAsset(publicCanvasAssetToInsertPayload(asset))}
                                    onPreview={setPreview}
                                    onRetry={() => void loadPublicAssetPage(undefined, false, publicAssetKeyword)}
                                    onLoadMore={() => void loadPublicAssetPage(publicNextCursor, true, publicAssetKeyword)}
                                />
                            )}
                        </div>
                    </>
                ) : null}
                {activeTab === "prompts" ? (
                    <>
                        <PanelSubTabButtonGroup
                            label="提示词来源"
                            value={promptSource}
                            items={[
                                { value: "my", label: "我的提示词", count: myPrompts.loaded ? myPrompts.total : undefined },
                                { value: "library", label: "词库", count: libraryPrompts.loaded ? libraryPrompts.total : undefined },
                            ]}
                            onChange={(value) => setPromptSource(value as PromptSource)}
                        />
                        <div className="min-h-0 flex-1 overflow-hidden">
                            {promptSource === "my" ? (
                                <PromptAssets
                                    collection={myPrompts}
                                    category={myCategory}
                                    keyword={mySearch}
                                    onKeywordChange={setMySearch}
                                    onSearch={(keyword) => {
                                        requestVersions.current.my += 1;
                                        setMyKeyword(keyword);
                                        setMyPrompts((current) => ({ ...emptyCollection(), categories: current.categories }));
                                    }}
                                    onCategoryChange={(category) => {
                                        requestVersions.current.my += 1;
                                        setMyCategory(category);
                                        setMyPrompts((current) => ({ ...emptyCollection(), categories: current.categories }));
                                    }}
                                    onInsert={onInsertPrompt}
                                    onPreview={setPreview}
                                    onRetry={() => void loadPromptPage("my", 1, myCategory, myKeyword)}
                                    onLoadMore={() => void loadPromptPage("my", myPrompts.page + 1, myCategory, myKeyword)}
                                />
                            ) : (
                                <PromptAssets
                                    collection={libraryPrompts}
                                    category={libraryCategory}
                                    keyword={librarySearch}
                                    onKeywordChange={setLibrarySearch}
                                    onSearch={(keyword) => {
                                        requestVersions.current.library += 1;
                                        setLibraryKeyword(keyword);
                                        setLibraryPrompts((current) => ({ ...emptyCollection(), categories: current.categories }));
                                    }}
                                    onCategoryChange={(category) => {
                                        requestVersions.current.library += 1;
                                        setLibraryCategory(category);
                                        setLibraryPrompts((current) => ({ ...emptyCollection(), categories: current.categories }));
                                    }}
                                    onInsert={onInsertPrompt}
                                    onPreview={setPreview}
                                    onRetry={() => void loadPromptPage("library", 1, libraryCategory, libraryKeyword)}
                                    onLoadMore={() => void loadPromptPage("library", libraryPrompts.page + 1, libraryCategory, libraryKeyword)}
                                />
                            )}
                        </div>
                    </>
                ) : null}
                {IP_REFERENCE_ENTRY_VISIBLE && activeTab === "ip" ? (
                    <PanelScroll>
                        <div className="py-3">
                            <IpReferencePicker compact value={project?.ipReferences || []} onChange={(ipReferences) => updateProject(projectId, { ipReferences })} />
                        </div>
                    </PanelScroll>
                ) : null}
            </div>
        </div>
    );

    return (
        <>
            {open && screens.lg === true ? (
                <aside className="h-full min-h-0 w-80 shrink-0 border-r" style={{ borderColor: theme.toolbar.border }}>
                    {panel}
                </aside>
            ) : null}
            <Drawer
                rootClassName="canvas-assets-drawer"
                placement="left"
                size={336}
                open={open && screens.lg !== true}
                closable={false}
                onClose={onClose}
                styles={{ wrapper: { maxWidth: "100vw" }, body: { height: "100%", padding: 0, overflow: "hidden" } }}
            >
                {screens.lg !== true ? panel : null}
            </Drawer>
            <MediaPreviewModal preview={preview} onClose={() => setPreview(undefined)} />
        </>
    );
}

function PanelTabButton({ label, count, active, onClick }: { label: string; count?: number; active: boolean; onClick: () => void }) {
    const theme = canvasThemes[useCanvasColorTheme().theme];
    return (
        <button
            type="button"
            role="tab"
            aria-selected={active}
            className="flex h-10 items-center justify-center gap-1 border-b-2 text-xs font-medium transition hover:opacity-75"
            style={{ borderColor: active ? theme.node.activeStroke : "transparent", color: active ? theme.node.text : theme.node.muted }}
            onClick={onClick}
        >
            {label}
            {typeof count === "number" ? <span className="text-[10px] font-normal opacity-45">{count}</span> : null}
        </button>
    );
}

function PanelSubTabButtonGroup({ label, value, items, onChange }: { label: string; value: string; items: Array<{ value: string; label: string; count?: number }>; onChange: (value: string) => void }) {
    const theme = canvasThemes[useCanvasColorTheme().theme];
    return (
        <div className="grid shrink-0 grid-cols-2 gap-1 border-b px-3 py-1.5" role="tablist" aria-label={label} style={{ borderColor: theme.toolbar.border }}>
            {items.map((item) => {
                const active = item.value === value;
                return (
                    <button
                        key={item.value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className="flex h-8 min-w-0 items-center justify-center gap-1 rounded-md px-2 text-xs font-medium transition hover:opacity-80"
                        style={{ background: active ? theme.toolbar.itemHover : "transparent", color: active ? theme.node.text : theme.node.muted }}
                        onClick={() => onChange(item.value)}
                    >
                        <span className="truncate">{item.label}</span>
                        {typeof item.count === "number" ? <span className="shrink-0 text-[10px] font-normal opacity-45">{item.count}</span> : null}
                    </button>
                );
            })}
        </div>
    );
}

function CurrentCanvasAssets({ items, onLocate, onPreview }: { items: CurrentMedia[]; onLocate: (id: string) => void; onPreview: (preview: MediaPreview) => void }) {
    const [preferredKind, setPreferredKind] = useState<CurrentMediaKind>("image");
    const images = items.filter((item) => item.kind === "image");
    const videos = items.filter((item) => item.kind === "video");
    if (!items.length) return <PanelEmpty icon={<ImageIcon className="size-5" />} text="当前画布还没有图片或视频" />;
    const kind = preferredKind === "image" && images.length ? "image" : preferredKind === "video" && videos.length ? "video" : images.length ? "image" : "video";
    const visibleItems = kind === "image" ? images : videos;
    return (
        <div className="flex h-full min-h-0 flex-col">
            {images.length && videos.length ? <MediaKindSwitch kind={kind} imageCount={images.length} videoCount={videos.length} onChange={setPreferredKind} /> : null}
            <div className="hide-scrollbar grid min-h-0 flex-1 auto-rows-max grid-cols-4 gap-2 overflow-y-auto px-3 py-3" data-testid="canvas-current-assets-grid">
                {visibleItems.map((item) => (
                    <ThumbnailActionCard key={item.id} title={item.title} action="定位" actionIcon={<LocateFixed className="size-3" />} onAction={() => onLocate(item.id)} onPreview={() => onPreview(item)}>
                        <MediaThumbnail kind={item.kind} url={item.url} title={item.title} />
                    </ThumbnailActionCard>
                ))}
            </div>
        </div>
    );
}

function LibraryAssets({
    collection,
    kind,
    keyword,
    onKeywordChange,
    onSearch,
    onKindChange,
    onInsert,
    onPreview,
    onRetry,
    onLoadMore,
}: {
    collection: PagedCollection<Asset>;
    kind: AssetKind | "all";
    keyword: string;
    onKeywordChange: (value: string) => void;
    onSearch: (value: string) => void;
    onKindChange: (value: AssetKind | "all") => void;
    onInsert: (asset: Asset) => void;
    onPreview: (preview: MediaPreview) => void;
    onRetry: () => void;
    onLoadMore: () => void;
}) {
    const kindLabels: Record<AssetKind | "all", string> = { all: "全部", image: "图片", video: "视频", audio: "音频", text: "文本" };
    return (
        <PanelScroll>
            <PanelFilters
                keyword={keyword}
                onKeywordChange={onKeywordChange}
                onSearch={onSearch}
                filterLabel={kindLabels[kind]}
                filterItems={(Object.keys(kindLabels) as Array<AssetKind | "all">).map((value) => ({ key: value, label: kindLabels[value] }))}
                onFilterChange={(value) => onKindChange(value as AssetKind | "all")}
            />
            <CollectionState collection={collection} emptyText="没有找到素材" onRetry={onRetry} />
            {collection.items.length ? (
                <div className="grid grid-cols-4 gap-2 pb-3" data-testid="canvas-library-assets-grid">
                    {collection.items.map((asset) => {
                        const preview = assetPreview(asset);
                        return (
                            <ThumbnailActionCard key={asset.id} title={asset.title} action="插入" onAction={() => onInsert(asset)} onPreview={preview ? () => onPreview(preview) : undefined}>
                                <LibraryAssetThumbnail asset={asset} />
                            </ThumbnailActionCard>
                        );
                    })}
                </div>
            ) : null}
            <LoadMore collection={collection} onLoadMore={onLoadMore} />
        </PanelScroll>
    );
}

function PublicCanvasAssets({
    collection,
    kind,
    keyword,
    nextCursor,
    onKeywordChange,
    onSearch,
    onKindChange,
    onInsert,
    onPreview,
    onRetry,
    onLoadMore,
}: {
    collection: PagedCollection<PublicCanvasAsset>;
    kind: PublicMediaKind | "all";
    keyword: string;
    nextCursor?: string;
    onKeywordChange: (value: string) => void;
    onSearch: (value: string) => void;
    onKindChange: (value: PublicMediaKind | "all") => void;
    onInsert: (asset: PublicCanvasAsset) => void;
    onPreview: (preview: MediaPreview) => void;
    onRetry: () => void;
    onLoadMore: () => void;
}) {
    const kindLabels: Record<PublicMediaKind | "all", string> = { all: "全部", image: "图片", video: "视频", audio: "音频" };
    const visible = collection.items.filter((asset) => kind === "all" || asset.kind === kind);
    return (
        <PanelScroll>
            <PanelFilters
                keyword={keyword}
                onKeywordChange={onKeywordChange}
                onSearch={onSearch}
                filterLabel={kindLabels[kind]}
                filterItems={(Object.keys(kindLabels) as Array<PublicMediaKind | "all">).map((value) => ({ key: value, label: kindLabels[value] }))}
                onFilterChange={(value) => onKindChange(value as PublicMediaKind | "all")}
            />
            {collection.items.length === 0 ? <CollectionState collection={collection} emptyText="没有找到公共素材" onRetry={onRetry} /> : null}
            {collection.items.length > 0 && visible.length === 0 ? <PanelEmpty icon={<Search className="size-5" />} text="没有符合类型的公共素材" /> : null}
            {visible.length ? (
                <div className="grid grid-cols-4 gap-2 pb-3" data-testid="canvas-public-assets-grid">
                    {visible.map((asset) => (
                        <ThumbnailActionCard key={asset.id} title={`${asset.title} · ${asset.category}`} action="插入" onAction={() => onInsert(asset)} onPreview={() => onPreview({ kind: asset.kind, title: asset.title, url: asset.url })}>
                            <PublicCanvasAssetThumbnail asset={asset} />
                        </ThumbnailActionCard>
                    ))}
                </div>
            ) : null}
            {nextCursor && collection.items.length ? (
                <button type="button" className="mb-4 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-xs transition hover:opacity-70" onClick={onLoadMore} disabled={collection.loading}>
                    {collection.loading ? <Spin size="small" /> : null}
                    加载更多公共素材
                </button>
            ) : null}
        </PanelScroll>
    );
}

function PublicCanvasAssetThumbnail({ asset }: { asset: PublicCanvasAsset }) {
    if (asset.kind === "image") return <img src={imagePreviewUrl(asset.url, 320)} alt={asset.title} className="size-full object-cover" loading="lazy" />;
    if (asset.kind === "video") return <video src={asset.url} aria-label={asset.title} className="pointer-events-none size-full object-cover" muted playsInline preload="metadata" />;
    return <FallbackThumbnail icon={<FileAudio className="size-5" />} />;
}

function PromptAssets({
    collection,
    category,
    keyword,
    onKeywordChange,
    onSearch,
    onCategoryChange,
    onInsert,
    onPreview,
    onRetry,
    onLoadMore,
}: {
    collection: PagedCollection<Prompt>;
    category: string;
    keyword: string;
    onKeywordChange: (value: string) => void;
    onSearch: (value: string) => void;
    onCategoryChange: (value: string) => void;
    onInsert: (prompt: string) => void;
    onPreview: (preview: MediaPreview) => void;
    onRetry: () => void;
    onLoadMore: () => void;
}) {
    const categories = [ALL_PROMPTS_OPTION, ...collection.categories];
    return (
        <PanelScroll>
            <PanelFilters
                keyword={keyword}
                onKeywordChange={onKeywordChange}
                onSearch={onSearch}
                filterLabel={promptCategoryLabel(category)}
                filterItems={categories.map((value) => ({ key: value, label: promptCategoryLabel(value) }))}
                onFilterChange={onCategoryChange}
            />
            <CollectionState collection={collection} emptyText="没有找到提示词" onRetry={onRetry} />
            {collection.items.length ? (
                <div className="grid grid-cols-4 gap-2 pb-3" data-testid="canvas-prompt-assets-grid">
                    {collection.items.map((item) => (
                        <ThumbnailActionCard key={item.id} title={item.title} action="插入" onAction={() => onInsert(item.prompt)} onPreview={item.coverUrl ? () => onPreview({ kind: "image", title: item.title, url: item.coverUrl }) : undefined}>
                            {item.coverUrl ? <img src={imagePreviewUrl(item.coverUrl, 320)} alt={item.title} className="size-full object-cover" loading="lazy" /> : <FallbackThumbnail icon={<Sparkles className="size-5" />} />}
                        </ThumbnailActionCard>
                    ))}
                </div>
            ) : null}
            <LoadMore collection={collection} onLoadMore={onLoadMore} />
        </PanelScroll>
    );
}

function PanelFilters({
    keyword,
    onKeywordChange,
    onSearch,
    filterLabel,
    filterItems,
    onFilterChange,
}: {
    keyword: string;
    onKeywordChange: (value: string) => void;
    onSearch: (value: string) => void;
    filterLabel: string;
    filterItems: Array<{ key: string; label: string }>;
    onFilterChange: (value: string) => void;
}) {
    const theme = canvasThemes[useCanvasColorTheme().theme];
    return (
        <div className="sticky top-0 z-10 mb-3 flex gap-1.5 pb-2 pt-3 backdrop-blur-sm">
            <Input
                size="small"
                allowClear
                value={keyword}
                prefix={<Search className="size-3.5 opacity-55" aria-hidden="true" />}
                placeholder="搜索"
                className="min-w-0 flex-1"
                onChange={(event) => {
                    onKeywordChange(event.target.value);
                    if (!event.target.value) onSearch("");
                }}
                onPressEnter={() => onSearch(keyword.trim())}
                aria-label="搜索资产"
            />
            <Dropdown trigger={["click"]} menu={{ items: filterItems, onClick: ({ key }) => onFilterChange(key) }}>
                <button type="button" className="flex h-8 max-w-24 items-center gap-1 rounded-md border px-2 text-xs" style={{ borderColor: theme.toolbar.border, background: theme.node.panel, color: theme.node.text }} aria-label="筛选分类">
                    <SlidersHorizontal className="size-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{filterLabel}</span>
                </button>
            </Dropdown>
        </div>
    );
}

function PanelScroll({ children }: { children: ReactNode }) {
    const theme = canvasThemes[useCanvasColorTheme().theme];
    return (
        <div className="hide-scrollbar h-full min-h-0 overflow-y-auto px-3" style={{ background: theme.node.panel }}>
            {children}
        </div>
    );
}

function CollectionState<T>({ collection, emptyText, onRetry }: { collection: PagedCollection<T>; emptyText: string; onRetry: () => void }) {
    if (collection.loading && !collection.items.length)
        return (
            <div className="grid min-h-40 place-items-center">
                <Spin size="small" />
            </div>
        );
    if (collection.error && !collection.items.length) return <PanelError message={collection.error} onRetry={onRetry} />;
    if (collection.loaded && !collection.items.length) return <PanelEmpty icon={<Search className="size-5" />} text={emptyText} />;
    return null;
}

function LoadMore<T>({ collection, onLoadMore }: { collection: PagedCollection<T>; onLoadMore: () => void }) {
    if (!collection.items.length || collection.items.length >= collection.total) return null;
    return (
        <button type="button" className="mb-4 flex h-8 w-full items-center justify-center gap-1.5 rounded-md text-xs transition hover:opacity-70" onClick={onLoadMore} disabled={collection.loading}>
            {collection.loading ? <Spin size="small" /> : null}
            加载更多
        </button>
    );
}

function ThumbnailActionCard({ title, action, actionIcon, onAction, onPreview, children }: { title: string; action: string; actionIcon?: ReactNode; onAction: () => void; onPreview?: () => void; children: ReactNode }) {
    const theme = canvasThemes[useCanvasColorTheme().theme];
    return (
        <article className="min-w-0" title={title}>
            {onPreview ? (
                <button
                    type="button"
                    className="block aspect-square w-full overflow-hidden rounded-md border transition hover:opacity-85 focus-visible:outline-none focus-visible:ring-2"
                    style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}
                    onClick={onPreview}
                    aria-label={`预览${title}`}
                >
                    {children}
                </button>
            ) : (
                <div className="aspect-square w-full overflow-hidden rounded-md border" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }}>
                    {children}
                </div>
            )}
            <button type="button" className="mt-1 flex h-5 w-full items-center justify-center gap-1 text-[11px] font-medium transition hover:opacity-65" style={{ color: theme.toolbar.item }} onClick={onAction} aria-label={`${action}${title}`}>
                {actionIcon}
                {action}
            </button>
        </article>
    );
}

function MediaKindSwitch({ kind, imageCount, videoCount, onChange }: { kind: CurrentMediaKind; imageCount: number; videoCount: number; onChange: (kind: CurrentMediaKind) => void }) {
    const theme = canvasThemes[useCanvasColorTheme().theme];
    return (
        <div className="mx-3 mt-3 grid grid-cols-2 gap-1 rounded-lg border p-1" style={{ borderColor: theme.toolbar.border, background: theme.node.fill }} role="tablist" aria-label="当前资产类型">
            {(["image", "video"] as const).map((value) => {
                const active = kind === value;
                return (
                    <button
                        key={value}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        className="h-7 rounded-md text-xs font-medium transition"
                        style={{ background: active ? theme.node.panel : "transparent", color: active ? theme.node.text : theme.node.muted }}
                        onClick={() => onChange(value)}
                    >
                        {value === "image" ? "图片" : "视频"} <span className="text-[10px] opacity-45">{value === "image" ? imageCount : videoCount}</span>
                    </button>
                );
            })}
        </div>
    );
}

function MediaThumbnail({ kind, url, title, posterUrl }: { kind: CurrentMediaKind; url: string; title: string; posterUrl?: string }) {
    if (kind === "image") return <img src={imagePreviewUrl(url, 320)} alt={title} className="size-full object-cover" loading="lazy" />;
    return <video src={url} poster={posterUrl ? imagePreviewUrl(posterUrl, 320) : undefined} aria-label={title} className="pointer-events-none size-full object-cover" muted playsInline preload="metadata" />;
}

function LibraryAssetThumbnail({ asset }: { asset: Asset }) {
    const preview = assetPreview(asset);
    if (preview) return <MediaThumbnail {...preview} />;
    if (asset.kind === "audio") return <FallbackThumbnail icon={<FileAudio className="size-5" />} />;
    return <FallbackThumbnail icon={<FileText className="size-5" />} />;
}

function FallbackThumbnail({ icon }: { icon: ReactNode }) {
    const theme = canvasThemes[useCanvasColorTheme().theme];
    return (
        <div className="grid size-full place-items-center" style={{ color: theme.node.muted }}>
            {icon}
        </div>
    );
}

function PanelEmpty({ icon, text }: { icon: ReactNode; text: string }) {
    const theme = canvasThemes[useCanvasColorTheme().theme];
    return (
        <div className="grid min-h-48 place-items-center px-5 text-center">
            <div>
                <div className="mx-auto mb-2 grid size-9 place-items-center rounded-full" style={{ background: theme.node.fill, color: theme.node.muted }}>
                    {icon}
                </div>
                <p className="text-xs" style={{ color: theme.node.muted }}>
                    {text}
                </p>
            </div>
        </div>
    );
}

function PanelError({ message, onRetry }: { message: string; onRetry: () => void }) {
    const theme = canvasThemes[useCanvasColorTheme().theme];
    return (
        <div className="grid min-h-48 place-items-center px-5 text-center">
            <div>
                <p className="mb-2 text-xs" style={{ color: theme.node.danger }}>
                    {message}
                </p>
                <button type="button" className="mx-auto flex items-center gap-1 text-xs" onClick={onRetry}>
                    <RefreshCw className="size-3.5" />
                    重试
                </button>
            </div>
        </div>
    );
}

function MediaPreviewModal({ preview, onClose }: { preview?: MediaPreview; onClose: () => void }) {
    return (
        <Modal open={Boolean(preview)} onCancel={onClose} footer={null} centered width="auto" destroyOnHidden title={null} styles={{ body: { padding: 0, display: "flex", justifyContent: "center", alignItems: "center", maxHeight: "82dvh" } }}>
            {preview?.kind === "image" ? <img src={imagePreviewUrl(preview.url, 1920)} alt={preview.title} className="block max-h-[82dvh] max-w-[min(88vw,1100px)] rounded-lg object-contain" /> : null}
            {preview?.kind === "audio" ? <audio src={preview.url} aria-label={preview.title} controls autoPlay className="max-w-[min(88vw,640px)]" /> : null}
            {preview?.kind === "video" ? (
                <video
                    src={preview.url}
                    poster={preview.posterUrl ? imagePreviewUrl(preview.posterUrl, 1280) : undefined}
                    aria-label={preview.title}
                    className="block max-h-[82dvh] max-w-[min(88vw,1100px)] rounded-lg object-contain"
                    controls
                    autoPlay
                    playsInline
                />
            ) : null}
        </Modal>
    );
}

function assetPreview(asset: Asset): VisualMediaPreview | undefined {
    if (asset.kind === "image") return { kind: "image", title: asset.title, url: asset.data.serverUrl || asset.data.remoteUrl || asset.data.dataUrl };
    if (asset.kind === "video") return { kind: "video", title: asset.title, url: asset.data.serverUrl || asset.data.remoteUrl || asset.data.url, posterUrl: asset.coverUrl || undefined };
    return undefined;
}

function uniqueById<T extends { id: string }>(items: T[]) {
    return [...new Map(items.map((item) => [item.id, item])).values()];
}
