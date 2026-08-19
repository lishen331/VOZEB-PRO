import { AudioLines, CheckCircle2, Film, ImageIcon, Link2, Mic2, PanelsTopLeft, Video, Workflow } from "lucide-react";
import type { ReactNode } from "react";

import type { PublicProcessSnapshot } from "@/lib/practice-domain";

export function PublicWorkProcessView({ process }: { process: PublicProcessSnapshot }) {
    return (
        <section className="hide-scrollbar max-h-[min(68dvh,680px)] min-w-0 overflow-y-auto px-1 pb-3" aria-label={process.sourceType === "canvas" ? "画布制作流程" : "短剧制作流程"}>
            <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-background/95 px-2 py-3 backdrop-blur">
                <span className="inline-flex min-w-0 items-center gap-2 text-sm font-semibold">
                    {process.sourceType === "canvas" ? <Workflow className="size-4 shrink-0" /> : <Film className="size-4 shrink-0" />}
                    <span className="truncate">{process.sourceType === "canvas" ? "画布制作流程" : "短剧制作流程"}</span>
                </span>
                <span className="shrink-0 rounded-md border border-border bg-muted px-2 py-1 text-[11px] text-muted-foreground">只读</span>
            </header>
            {process.sourceType === "canvas" ? <CanvasProcess process={process} /> : <DramaProcess process={process} />}
        </section>
    );
}

function CanvasProcess({ process }: { process: Extract<PublicProcessSnapshot, { sourceType: "canvas" }> }) {
    return (
        <div className="space-y-3 px-2 pt-3">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <Metric icon={<PanelsTopLeft className="size-3.5" />} label="节点" value={process.nodes.length} />
                <Metric icon={<Link2 className="size-3.5" />} label="连接" value={process.connections.length} />
                <Metric icon={<ImageIcon className="size-3.5" />} label="素材" value={process.assets.length} />
            </div>
            <div className="space-y-2">
                {process.nodes.map((node, index) => (
                    <article key={node.id} className="grid min-w-0 grid-cols-[28px_minmax(0,1fr)] gap-2.5 rounded-md border border-border bg-background p-3">
                        <span className="grid size-7 place-items-center rounded-md bg-muted text-xs font-semibold text-muted-foreground">{index + 1}</span>
                        <div className="min-w-0">
                            <div className="flex min-w-0 items-center justify-between gap-2">
                                <h3 className="truncate text-sm font-medium">{node.title || "未命名节点"}</h3>
                                <span className="shrink-0 text-[11px] text-muted-foreground">{node.type}</span>
                            </div>
                            {node.summary ? <p className="mt-1 break-words text-xs leading-5 text-muted-foreground">{node.summary}</p> : null}
                            {node.assetIds?.length ? <p className="mt-1.5 text-[11px] text-muted-foreground">关联公开素材 {node.assetIds.length} 项</p> : null}
                        </div>
                    </article>
                ))}
                {!process.nodes.length ? <EmptyProcess text="该画布没有可公开的流程节点" /> : null}
            </div>
        </div>
    );
}

function DramaProcess({ process }: { process: Extract<PublicProcessSnapshot, { sourceType: "drama" }> }) {
    return (
        <div className="space-y-3 px-2 pt-3">
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <Metric icon={<Film className="size-3.5" />} label="分集" value={process.episodes.length} />
                <Metric icon={<PanelsTopLeft className="size-3.5" />} label="角色" value={process.characters.length} />
                <Metric icon={<ImageIcon className="size-3.5" />} label="场景" value={process.scenes.length} />
            </div>
            {process.episodes.map((episode) => {
                const storyboardCount = episode.shots.filter((shot) => shot.storyboardAssetIds?.length).length;
                const videoCount = episode.shots.filter((shot) => shot.videoAssetIds?.length).length;
                const audioCount = episode.shots.filter((shot) => shot.audioAssetIds?.length).length;
                return (
                    <article key={episode.id} className="rounded-md border border-border bg-background p-3">
                        <div className="flex min-w-0 items-center justify-between gap-2">
                            <h3 className="truncate text-sm font-semibold">{episode.title}</h3>
                            <span className="shrink-0 text-[11px] text-muted-foreground">第 {episode.order} 集</span>
                        </div>
                        {episode.scriptSummary ? <p className="mt-1.5 break-words text-xs leading-5 text-muted-foreground">{episode.scriptSummary}</p> : null}
                        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <State icon={<CheckCircle2 className="size-3.5" />} text={episode.reviewStatus === "approved" ? "剧本已审核" : "剧本待审核"} />
                            <State icon={<ImageIcon className="size-3.5" />} text={`分镜 ${storyboardCount}`} />
                            <State icon={<Video className="size-3.5" />} text={`视频 ${videoCount}`} />
                            <State icon={<Mic2 className="size-3.5" />} text={`配音 ${audioCount}`} />
                        </div>
                        <div className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                            <AudioLines className="size-3.5" /> {videoCount > 0 && audioCount > 0 ? "已有可合成镜头" : "合成素材尚未完整"}
                        </div>
                    </article>
                );
            })}
            {!process.episodes.length ? <EmptyProcess text="该短剧没有可公开的分集流程" /> : null}
        </div>
    );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
    return (
        <div className="rounded-md border border-border bg-muted/40 px-2 py-2.5">
            <span className="mx-auto flex w-fit items-center gap-1 text-muted-foreground">
                {icon} {label}
            </span>
            <strong className="mt-1 block text-base text-foreground">{value}</strong>
        </div>
    );
}

function State({ icon, text }: { icon: ReactNode; text: string }) {
    return (
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
            {icon} <span className="truncate">{text}</span>
        </span>
    );
}

function EmptyProcess({ text }: { text: string }) {
    return <div className="grid min-h-36 place-items-center rounded-md border border-dashed border-border px-4 text-center text-sm text-muted-foreground">{text}</div>;
}
