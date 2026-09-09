"use client";

import { App, Button, Image as AntImage, Modal, Spin, Tag } from "antd";
import { BookOpen, Boxes, ChevronRight, Clapperboard, Download, Image as ImageIcon, Maximize2, Music2, Sparkles, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { IP_REFERENCE_ENTRY_VISIBLE } from "@/lib/ip-library-domain";
import type { IpDetail, IpPublicItem } from "@/lib/server/ip-library-service";
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

export function ipUseTargetPath(target: "canvas" | "drama" | "practice", detail: Pick<IpDetail, "id">, subIpId: string) {
    const query = new URLSearchParams({ ipId: detail.id, subIpId });
    return `/${target}?${query.toString()}`;
}

export function visibleIpDetailCommands() {
    return IP_REFERENCE_ENTRY_VISIBLE ? (["reference", "download-package"] as const) : (["download-package"] as const);
}

export default function IpLibraryDetail({ ipId, subIpId }: { ipId: string; subIpId?: string }) {
    const { message } = App.useApp();
    const [detail, setDetail] = useState<IpDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState("");

    useEffect(() => {
        let active = true;
        setLoading(true);
        void ipLibraryApi
            .get(ipId, subIpId)
            .then((value) => {
                if (!active) return;
                setDetail(value);
            })
            .catch((error) => active && message.error(error instanceof Error ? error.message : "IP 详情加载失败"))
            .finally(() => active && setLoading(false));
        return () => {
            active = false;
        };
    }, [ipId, message, subIpId]);

    const selected = detail?.subIps[0];
    const grouped = useMemo(() => groupIpLibraryItems(selected?.items || []), [selected]);
    const download = async (input: { subIpId?: string; itemId?: string; packageScope?: "ip" | "sub_ip" } = {}) => {
        if (!detail || !selected || downloading) return;
        const downloadKey = input.itemId || (input.packageScope === "sub_ip" && input.subIpId ? `sub-ip-${input.subIpId}` : input.packageScope || "package");
        setDownloading(downloadKey);
        try {
            const result = await ipLibraryApi.download(detail.id, {
                ...(input.packageScope === "ip" ? {} : { subIpId: input.subIpId || selected.id }),
                itemIds: input.itemId ? [input.itemId] : undefined,
                package: !input.itemId,
                packageScope: input.packageScope,
            });
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
    if (!detail || !selected) return <main className="grid h-full min-h-0 place-items-center px-4 text-sm text-muted-foreground">IP 不存在或当前无权查看</main>;
    const showSubIpDetail = Boolean(subIpId) || detail.singleSubIp;

    return (
        <main className="h-full min-h-0 overflow-y-auto bg-background text-foreground" data-ip-library-detail>
            <div className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-6 sm:py-8">
                {showSubIpDetail ? (
                    <header className="border-b border-border pb-5 sm:pb-8">
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>IP 库</span>
                            <ChevronRight className="size-3.5" />
                            <Link href={`/ip-library/${encodeURIComponent(detail.id)}`} className="truncate hover:text-foreground">
                                {detail.title}
                            </Link>
                            {subIpId ? (
                                <>
                                    <ChevronRight className="size-3.5" />
                                    <span className="truncate">{selected.title}</span>
                                </>
                            ) : null}
                        </div>
                        <div className="mt-5 grid min-w-0 gap-5 sm:grid-cols-[minmax(180px,300px)_minmax(0,1fr)] sm:gap-8">
                            <div className="mx-auto flex aspect-[4/3] w-full max-w-[300px] items-center justify-center overflow-hidden rounded-xl border border-border bg-card p-2 shadow-sm">
                                {selected.coverPreviewUrl ? <img src={selected.coverPreviewUrl} alt={selected.title} className="max-h-full max-w-full object-contain" /> : <BookOpen className="size-12 text-muted-foreground/40" />}
                            </div>
                            <div className="flex min-w-0 flex-col justify-center rounded-xl border border-border bg-card p-4 sm:p-6">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Tag color={detail.visibility === "public" ? "blue" : "green"} className="!m-0">
                                        {detail.visibility === "public" ? "公共 IP" : "本校 IP"}
                                    </Tag>
                                    {selected.isExclusive ? (
                                        <Tag color="gold" className="!m-0">
                                            独家授权
                                        </Tag>
                                    ) : null}
                                    {subIpId || !detail.singleSubIp ? <Tag className="!m-0">子 IP</Tag> : null}
                                </div>
                                <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{subIpId ? selected.title : detail.title}</h1>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">{selected.summary || detail.summary || "暂无简介"}</p>
                                {selected.tags.length ? (
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                        {selected.tags.map((tag) => (
                                            <Tag key={tag} className="!m-0">
                                                {tag}
                                            </Tag>
                                        ))}
                                    </div>
                                ) : null}
                                <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                                    {IP_REFERENCE_ENTRY_VISIBLE ? <DormantReferenceActions detail={detail} subIpId={selected.id} /> : null}
                                    <Button icon={<Download className="size-4" />} loading={downloading === "sub_ip"} onClick={() => void download({ packageScope: "sub_ip" })}>
                                        下载此子 IP 内容包
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </header>
                ) : (
                    <IpOverview detail={detail} downloading={downloading} onDownload={() => void download({ packageScope: "ip" })} onDownloadSubIp={(id) => void download({ subIpId: id, packageScope: "sub_ip" })} />
                )}

                {showSubIpDetail ? (
                    <>
                        <IpLibrarySection
                            title="文本"
                            description="世界观、人物小传、剧本与创作说明。"
                            items={grouped.text}
                            layout="list"
                            initialCount={3}
                            renderItem={(item) => <TextItem key={item.id} item={item} onDownload={() => void download({ itemId: item.id })} loading={downloading === item.id} />}
                        />
                        {grouped.imageCount ? (
                            <section className="border-t border-border py-5 sm:py-7" aria-labelledby="ip-images-heading">
                                <div>
                                    <h2 id="ip-images-heading" className="text-base font-semibold sm:text-lg">
                                        图片素材
                                    </h2>
                                    <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">按角色、场景、道具、特效和风格参考分类。</p>
                                </div>
                                <AntImage.PreviewGroup>
                                    <div className="mt-4 grid gap-6">
                                        {IP_IMAGE_CATEGORIES.filter((category) => grouped.images[category.value].length).map((category) => (
                                            <div key={category.value} className="min-w-0">
                                                <h3 className="text-sm font-medium">{category.label}</h3>
                                                <div className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                                                    {grouped.images[category.value].map((item) => (
                                                        <MediaItem key={item.id} item={item} onDownload={() => void download({ itemId: item.id })} loading={downloading === item.id} />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </AntImage.PreviewGroup>
                            </section>
                        ) : null}
                        <IpLibrarySection
                            title="音乐与声音"
                            description="背景音乐、主题音乐、角色声音、旁白和音效。"
                            items={grouped.audio}
                            renderItem={(item) => <MediaItem key={item.id} item={item} onDownload={() => void download({ itemId: item.id })} loading={downloading === item.id} />}
                        />
                        <IpLibrarySection
                            title="视频参考"
                            description="预告、动作、表演、镜头与片段参考。"
                            items={grouped.video}
                            renderItem={(item) => <MediaItem key={item.id} item={item} onDownload={() => void download({ itemId: item.id })} loading={downloading === item.id} />}
                        />
                    </>
                ) : null}
            </div>
        </main>
    );
}

function IpOverview({ detail, downloading, onDownload, onDownloadSubIp }: { detail: IpDetail; downloading: string; onDownload: () => void; onDownloadSubIp: (subIpId: string) => void }) {
    return (
        <>
            <header className="border-b border-border pb-5 sm:pb-8">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>IP 库</span>
                    <ChevronRight className="size-3.5" />
                    <span className="truncate">{detail.title}</span>
                </div>
                <div className="mt-5 grid min-w-0 gap-5 sm:grid-cols-[minmax(180px,300px)_minmax(0,1fr)] sm:gap-8">
                    <div className="mx-auto flex aspect-[4/3] w-full max-w-[300px] items-center justify-center overflow-hidden rounded-xl border border-border bg-card p-2 shadow-sm">
                        {detail.coverPreviewUrl ? <img src={detail.coverPreviewUrl} alt={detail.title} className="max-h-full max-w-full object-contain" /> : <BookOpen className="size-12 text-muted-foreground/40" />}
                    </div>
                    <div className="flex min-w-0 flex-col justify-center rounded-xl border border-border bg-card p-4 sm:p-6">
                        <div className="flex flex-wrap items-center gap-2">
                            <Tag color={detail.visibility === "public" ? "blue" : "green"} className="!m-0">
                                {detail.visibility === "public" ? "公共 IP" : "本校 IP"}
                            </Tag>
                            <Tag className="!m-0">{detail.subIps.length} 个子 IP</Tag>
                        </div>
                        <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">{detail.title}</h1>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail.summary || "暂无简介"}</p>
                        <div className="mt-5 border-t border-border pt-4">
                            <Button type="primary" icon={<Download className="size-4" />} loading={downloading === "ip"} onClick={onDownload}>
                                下载此 IP 内容包
                            </Button>
                        </div>
                    </div>
                </div>
            </header>
            <section className="border-b border-border py-6 sm:py-8">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <h2 className="text-base font-semibold sm:text-lg">子 IP</h2>
                        <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">选择一个子 IP 查看完整内容。</p>
                    </div>
                    <span className="text-xs tabular-nums text-muted-foreground">{detail.subIps.length} 个</span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {detail.subIps.map((subIp) => (
                        <article key={subIp.id} className="group overflow-hidden rounded-xl border border-border bg-card text-foreground transition hover:border-foreground/30 hover:shadow-sm">
                            <Link href={`/ip-library/${encodeURIComponent(detail.id)}/${encodeURIComponent(subIp.id)}`} className="block">
                                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted/50">
                                    {subIp.coverPreviewUrl ? (
                                        <img src={subIp.coverPreviewUrl} alt={subIp.title} className="size-full object-cover transition duration-300 group-hover:scale-[1.02]" />
                                    ) : (
                                        <BookOpen className="size-8 text-muted-foreground/40" />
                                    )}
                                </div>
                                <div className="min-w-0 p-3">
                                    <h3 className="truncate text-sm font-semibold">{subIp.title}</h3>
                                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{subIp.summary || "暂无简介"}</p>
                                </div>
                            </Link>
                            <div className="border-t border-border px-3 py-2">
                                <Button type="text" size="small" icon={<Download className="size-4" />} loading={downloading === `sub-ip-${subIp.id}`} onClick={() => onDownloadSubIp(subIp.id)}>
                                    下载子 IP 内容包
                                </Button>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </>
    );
}

export function groupIpLibraryItems(items: IpPublicItem[]) {
    const images = Object.fromEntries(IP_IMAGE_CATEGORIES.map((category) => [category.value, [] as IpPublicItem[]])) as Record<(typeof IP_IMAGE_CATEGORIES)[number]["value"], IpPublicItem[]>;
    for (const item of items) if (item.kind === "image" && item.category in images) images[item.category as keyof typeof images].push(item);
    return {
        text: items.filter((item) => item.kind === "text"),
        images,
        imageCount: Object.values(images).reduce((total, group) => total + group.length, 0),
        audio: items.filter((item) => item.kind === "audio"),
        video: items.filter((item) => item.kind === "video"),
    };
}

function TextItem({ item, onDownload, loading }: { item: IpPublicItem; onDownload: () => void; loading: boolean }) {
    return (
        <article className="min-w-0 rounded-xl border border-border bg-card p-3 sm:p-4">
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
        <article className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <div
                className={
                    item.kind === "audio"
                        ? "flex min-h-28 min-w-0 flex-col items-center justify-center gap-3 bg-muted/50 px-3 py-4"
                        : item.kind === "image"
                          ? "flex aspect-[4/3] min-w-0 items-center justify-center overflow-hidden bg-muted/50 p-2"
                          : "flex aspect-video min-w-0 items-center justify-center overflow-hidden bg-muted/50"
                }
            >
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

function DormantReferenceActions({ detail, subIpId }: { detail: IpDetail; subIpId: string }) {
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
                    <UseTarget icon={<Maximize2 className="size-5" />} title="画布" onClick={() => router.push(ipUseTargetPath("canvas", detail, subIpId))} />
                    <UseTarget icon={<Clapperboard className="size-5" />} title="短剧" onClick={() => router.push(ipUseTargetPath("drama", detail, subIpId))} />
                    {schoolContext ? <UseTarget icon={<Boxes className="size-5" />} title="练习" onClick={() => router.push(ipUseTargetPath("practice", detail, subIpId))} /> : null}
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
