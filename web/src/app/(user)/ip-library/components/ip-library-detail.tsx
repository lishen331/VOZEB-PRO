"use client";

import { App, Button, Image as AntImage, Modal, Spin, Tag } from "antd";
import { BookOpen, Boxes, CalendarClock, Clapperboard, Download, Image as ImageIcon, Maximize2, Music2, Sparkles, Video } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import type { IpDetail, IpPublicItem } from "@/lib/server/ip-library-service";
import { IP_REFERENCE_ENTRY_VISIBLE } from "@/lib/ip-library-domain";
import { ipLibraryApi } from "@/services/api/ip-library";
import { useSchoolContextStore } from "@/stores/use-school-context-store";
import { IpLibrarySection } from "./ip-library-section";

export const IP_IMAGE_CATEGORIES = [
    { value: "character", label: "角色" },
    { value: "scene", label: "场景" },
    { value: "prop", label: "道具" },
    { value: "effect", label: "特效" },
    { value: "style", label: "风格参考" },
] as const;

export function ipUseTargetPath(target: "canvas" | "drama" | "practice", detail: Pick<IpDetail, "id" | "version">) {
    const query = new URLSearchParams({ ipId: detail.id, versionId: detail.version.id });
    return `/${target}?${query.toString()}`;
}

export function visibleIpDetailCommands() {
    return IP_REFERENCE_ENTRY_VISIBLE ? (["reference", "download-package"] as const) : (["download-package"] as const);
}

export default function IpLibraryDetail({ ipId }: { ipId: string }) {
    const { message } = App.useApp();
    const [detail, setDetail] = useState<IpDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState("");

    useEffect(() => {
        let active = true;
        setLoading(true);
        void ipLibraryApi
            .get(ipId)
            .then((value) => active && setDetail(value))
            .catch((error) => active && message.error(error instanceof Error ? error.message : "IP 详情加载失败"))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [ipId, message]);

    const grouped = useMemo(() => groupIpLibraryItems(detail?.version.items || []), [detail]);
    const download = async (itemId?: string) => {
        if (!detail || downloading) return;
        setDownloading(itemId || "package");
        try {
            const result = await ipLibraryApi.download(detail.id, { versionId: detail.version.id, itemIds: itemId ? [itemId] : undefined, package: !itemId });
            if ("url" in result) window.location.assign(result.url);
            else saveBlob(result.blob, result.fileName);
        } catch (error) {
            message.error(error instanceof Error ? error.message : "下载失败");
        } finally {
            setDownloading("");
        }
    };

    if (loading)
        return (
            <main className="grid h-full min-h-0 place-items-center">
                <Spin />
            </main>
        );
    if (!detail) return <main className="grid h-full min-h-0 place-items-center px-4 text-sm text-muted-foreground">IP 不存在或当前无权查看</main>;

    return (
        <main className="h-full min-h-0 overflow-y-auto bg-background text-foreground" data-ip-library-detail>
            <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
                <header className="grid min-w-0 gap-4 border-b border-border pb-5 sm:grid-cols-[minmax(180px,320px)_minmax(0,1fr)] sm:gap-7 sm:pb-8">
                    <div className="flex aspect-[4/3] min-w-0 items-center justify-center overflow-hidden bg-muted/50">
                        {detail.coverPreviewUrl ? <img src={detail.coverPreviewUrl} alt={detail.title} className="max-h-full max-w-full object-contain" /> : <BookOpen className="size-12 text-muted-foreground/40" />}
                    </div>
                    <div className="flex min-w-0 flex-col justify-center">
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag className="!m-0">v{detail.version.versionNumber}</Tag>
                            <Tag color={detail.visibility === "public" ? "blue" : "green"} className="!m-0">
                                {detail.visibility === "public" ? "公共 IP" : "本校 IP"}
                            </Tag>
                            {detail.isExclusive ? (
                                <Tag color="gold" className="!m-0">
                                    独家授权
                                </Tag>
                            ) : null}
                        </div>
                        <h1 className="mt-3 text-2xl font-semibold tracking-normal sm:text-3xl">{detail.title}</h1>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail.summary || detail.version.summary || "暂无简介"}</p>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>当前版本：{detail.version.title}</span>
                            <span className="inline-flex items-center gap-1">
                                <CalendarClock className="size-3.5" />
                                更新于 {formatDate(detail.version.publishedAt || detail.updatedAt)}
                            </span>
                        </div>
                        {detail.version.tags.length ? <div className="mt-3 flex flex-wrap gap-1.5">{detail.version.tags.map((tag) => <Tag key={tag} className="!m-0">{tag}</Tag>)}</div> : null}
                        <div className="mt-5 flex flex-wrap gap-2">
                            {IP_REFERENCE_ENTRY_VISIBLE ? <DormantReferenceActions detail={detail} /> : null}
                            <Button icon={<Download className="size-4" />} loading={downloading === "package"} onClick={() => void download()}>
                                下载资源包
                            </Button>
                        </div>
                    </div>
                </header>

                <IpLibrarySection
                    title="文本"
                    description="世界观、人物小传、剧本与创作说明，只读查看。"
                    items={grouped.text}
                    layout="list"
                    initialCount={3}
                    renderItem={(item) => <TextItem key={item.id} item={item} onDownload={() => void download(item.id)} loading={downloading === item.id} />}
                />
                <section className="border-t border-border py-5 sm:py-7" aria-labelledby="ip-images-heading">
                    <div>
                        <h2 id="ip-images-heading" className="text-base font-semibold sm:text-lg">
                            图片素材
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">按角色、场景、道具、特效和风格参考分类。</p>
                    </div>
                    {grouped.imageCount ? (
                        <AntImage.PreviewGroup>
                            <div className="mt-4 grid gap-6">
                                {IP_IMAGE_CATEGORIES.filter((category) => grouped.images[category.value].length).map((category) => (
                                    <div key={category.value} className="min-w-0">
                                        <h3 className="text-sm font-medium">{category.label}</h3>
                                        <div className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                            {grouped.images[category.value].map((item) => <MediaItem key={item.id} item={item} onDownload={() => void download(item.id)} loading={downloading === item.id} />)}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </AntImage.PreviewGroup>
                    ) : <p className="mt-3 border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">暂无内容</p>}
                </section>
                <IpLibrarySection
                    title="音乐与声音"
                    description="背景音乐、主题音乐、角色声音、旁白和音效。"
                    items={grouped.audio}
                    renderItem={(item) => <MediaItem key={item.id} item={item} onDownload={() => void download(item.id)} loading={downloading === item.id} />}
                />
                <IpLibrarySection
                    title="视频参考"
                    description="预告、动作、表演、镜头与片段参考。"
                    items={grouped.video}
                    renderItem={(item) => <MediaItem key={item.id} item={item} onDownload={() => void download(item.id)} loading={downloading === item.id} />}
                />
            </div>

        </main>
    );
}

export function groupIpLibraryItems(items: IpPublicItem[]) {
    const images = Object.fromEntries(IP_IMAGE_CATEGORIES.map((category) => [category.value, [] as IpPublicItem[]])) as Record<(typeof IP_IMAGE_CATEGORIES)[number]["value"], IpPublicItem[]>;
    for (const item of items) if (item.kind === "image" && item.category in images) images[item.category as keyof typeof images].push(item);
    return { text: items.filter((item) => item.kind === "text"), images, imageCount: Object.values(images).reduce((total, group) => total + group.length, 0), audio: items.filter((item) => item.kind === "audio"), video: items.filter((item) => item.kind === "video") };
}

function TextItem({ item, onDownload, loading }: { item: IpPublicItem; onDownload: () => void; loading: boolean }) {
    return (
        <article className="min-w-0 border border-border bg-card p-3 sm:p-4">
            <div className="flex items-start justify-between gap-2">
                <BookOpen className="size-5 shrink-0" />
                <Button type="text" size="small" aria-label={`下载${item.title}`} icon={<Download className="size-4" />} loading={loading} onClick={onDownload} />
            </div>
            <h3 className="mt-2 text-sm font-semibold">{item.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">{item.summary}</p>
            <pre className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap break-words border-t border-border pt-3 font-sans text-sm leading-6 text-foreground">{item.textContent || "暂无正文"}</pre>
        </article>
    );
}

function MediaItem({ item, onDownload, loading }: { item: IpPublicItem; onDownload: () => void; loading: boolean }) {
    return (
        <article className="min-w-0 overflow-hidden border border-border bg-card">
            <div className={item.kind === "audio" ? "flex min-h-28 min-w-0 flex-col items-center justify-center gap-3 bg-muted/50 px-3 py-4" : "flex aspect-video min-w-0 items-center justify-center overflow-hidden bg-muted/50"}>
                {item.kind === "image" && item.previewUrl ? (
                    <AntImage src={item.previewUrl} alt={item.title} rootClassName="flex size-full items-center justify-center" className="!max-h-full !max-w-full !object-contain" />
                ) : item.kind === "video" && item.previewUrl ? (
                    <video src={item.previewUrl} controls preload="metadata" className="size-full object-contain" />
                ) : item.kind === "audio" && item.previewUrl ? (
                    <>
                        <Music2 className="size-7 text-muted-foreground" />
                        <audio src={item.previewUrl} controls preload="metadata" className="h-10 w-full min-w-0" />
                    </>
                ) : item.kind === "video" ? (
                    <Video className="m-auto size-8 h-full text-muted-foreground/50" />
                ) : (
                    <ImageIcon className="m-auto size-8 h-full text-muted-foreground/50" />
                )}
            </div>
            <div className="flex min-w-0 items-start justify-between gap-2 p-3">
                <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold">{item.title}</h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.summary}</p>
                </div>
                <Button type="text" size="small" aria-label={`下载${item.title}`} icon={<Download className="size-4" />} loading={loading} onClick={onDownload}>
                    原文件
                </Button>
            </div>
        </article>
    );
}

function DormantReferenceActions({ detail }: { detail: IpDetail }) {
    const router = useRouter();
    const schoolContext = useSchoolContextStore((state) => state.context);
    const [useOpen, setUseOpen] = useState(false);
    return (
        <>
            <Button type="primary" icon={<Sparkles className="size-4" />} onClick={() => setUseOpen(true)}>
                一键使用
            </Button>
            <Modal title="选择使用位置" open={useOpen} footer={null} destroyOnHidden width="min(520px, 100vw)" onCancel={() => setUseOpen(false)}>
                <div className="grid gap-2 sm:grid-cols-3">
                    <UseTarget icon={<Maximize2 className="size-5" />} title="画布" onClick={() => router.push(ipUseTargetPath("canvas", detail))} />
                    <UseTarget icon={<Clapperboard className="size-5" />} title="短剧" onClick={() => router.push(ipUseTargetPath("drama", detail))} />
                    {schoolContext ? <UseTarget icon={<Boxes className="size-5" />} title="无限练习" onClick={() => router.push(ipUseTargetPath("practice", detail))} /> : null}
                </div>
            </Modal>
        </>
    );
}

function UseTarget({ icon, title, onClick }: { icon: React.ReactNode; title: string; onClick: () => void }) {
    return (
        <button type="button" className="flex min-h-24 flex-col items-center justify-center gap-2 border border-border bg-card text-sm font-medium transition hover:border-foreground/30 hover:bg-muted/30" onClick={onClick}>
            {icon}
            <span>{title}</span>
        </button>
    );
}

function saveBlob(blob: Blob, fileName: string) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}

function formatDate(value: string) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toLocaleString("zh-CN", { hour12: false }) : "未知";
}
