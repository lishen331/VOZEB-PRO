"use client";

import { ArrowUpRight, Clock3, Crown, Flame, Layers, Play } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaCardCorners } from "@/components/gamma-ui/gamma-cards";
import { GammaBadge } from "@/components/gamma-ui/gamma-controls";
import { GammaLogo } from "@/components/gamma-ui/gamma-logo";
import { GammaStagger, GammaStaggerItem } from "@/components/gamma-ui/gamma-motion";
import { GammaSection } from "@/components/gamma-ui/gamma-shell";
import { gammaSubjectBySlug } from "@/components/gamma-ui/gamma-subjects";
import { cn } from "@/lib/utils";

const THUMB = "/style-thumbs";

/* ===== 继续创作：最近项目 ===== */

const RECENT_PROJECTS = [
    { id: "p1", title: "2027 春夏 · 新中式系列", subjectSlug: "fashion", cover: `${THUMB}/realistic.jpg`, edited: "12 分钟前", assets: 18, progress: 72 },
    { id: "p2", title: "毕设短片《雾港》分镜", subjectSlug: "film", cover: `${THUMB}/noir.jpg`, edited: "2 小时前", assets: 46, progress: 40 },
    { id: "p3", title: "民宿改造 · 客房软装", subjectSlug: "interior", cover: `${THUMB}/minimalist.jpg`, edited: "昨天", assets: 9, progress: 88 },
] as const;

export function GammaRecentProjects({ onOpen }: { onOpen: (title: string) => void }) {
    return (
        <GammaSection
            id="recent"
            title="继续创作"
            description="最近编辑的项目，进度与素材一目了然"
            action={
                <GammaButton size="sm" variant="ghost" trailingIcon={<ArrowUpRight className="size-3.5" />} onClick={() => onOpen("全部项目")}>
                    全部项目
                </GammaButton>
            }
        >
            <GammaStagger className="grid gap-4 md:grid-cols-3">
                {RECENT_PROJECTS.map((project) => {
                    const subject = gammaSubjectBySlug(project.subjectSlug);
                    const Icon = subject.icon;
                    return (
                        <GammaStaggerItem key={project.id}>
                            <button
                                type="button"
                                onClick={() => onOpen(project.title)}
                                className="group relative flex w-full items-center gap-4 overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] p-3 text-left ring-1 ring-[var(--gm-border)] transition-shadow duration-300 hover:shadow-[var(--gm-shadow)] hover:ring-[var(--gm-border-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                            >
                                <GammaCardCorners />
                                <span className="relative size-[72px] shrink-0 overflow-hidden rounded-[var(--gm-radius)]">
                                    {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材 */}
                                    <img src={project.cover} alt="" className="size-full object-cover transition-transform duration-500 group-hover:scale-110" />
                                    <span className="absolute right-1 bottom-1 grid size-5 place-items-center rounded-md bg-[rgba(4,6,12,0.6)] text-white backdrop-blur">
                                        <Icon className="size-3" />
                                    </span>
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-medium">{project.title}</span>
                                    <span className="mt-1 flex items-center gap-1.5 text-[11px] text-[var(--gm-text-3)]">
                                        <span>{subject.name}</span>
                                        <span aria-hidden>·</span>
                                        <Clock3 className="size-3" />
                                        {project.edited}
                                        <span aria-hidden>·</span>
                                        <Layers className="size-3" />
                                        {project.assets}
                                    </span>
                                    <span className="mt-2.5 flex items-center gap-2">
                                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--gm-surface-3)]">
                                            <span className="block h-full rounded-full bg-[image:var(--gm-gradient)]" style={{ width: `${project.progress}%` }} />
                                        </span>
                                        <span className="font-mono text-[10px] text-[var(--gm-text-3)] tabular-nums">{project.progress}%</span>
                                    </span>
                                </span>
                            </button>
                        </GammaStaggerItem>
                    );
                })}
            </GammaStagger>
        </GammaSection>
    );
}

/* ===== 灵感模板：横向滚动的模板条 ===== */

const TEMPLATES = [
    { id: "t1", title: "秀场 Lookbook", subjectSlug: "fashion", cover: `${THUMB}/realistic.jpg`, uses: "3.2k" },
    { id: "t2", title: "电影感分镜 6 格", subjectSlug: "film", cover: `${THUMB}/cinematic.jpg`, uses: "5.8k" },
    { id: "t3", title: "侘寂空间渲染", subjectSlug: "interior", cover: `${THUMB}/minimalist.jpg`, uses: "2.1k" },
    { id: "t4", title: "角色三视图", subjectSlug: "animation", cover: `${THUMB}/anime.jpg`, uses: "4.4k" },
    { id: "t5", title: "产品爆炸图", subjectSlug: "product", cover: `${THUMB}/low-poly.jpg`, uses: "1.6k" },
    { id: "t6", title: "电商主图套装", subjectSlug: "ecommerce", cover: `${THUMB}/3d-render.jpg`, uses: "6.0k" },
    { id: "t7", title: "游戏场景概念", subjectSlug: "game-art", cover: `${THUMB}/dark-fantasy.jpg`, uses: "2.9k" },
    { id: "t8", title: "釉色方案对比", subjectSlug: "ceramics", cover: `${THUMB}/chinese.jpg`, uses: "0.9k" },
] as const;

export function GammaTemplateRail({ onUse }: { onUse: (subjectSlug: string, title: string) => void }) {
    return (
        <GammaSection id="templates" title="灵感模板" description="各专业高频场景，一键起稿">
            <div className="hide-scrollbar -mx-1 flex snap-x gap-4 overflow-x-auto px-1 pt-1 pb-3">
                {TEMPLATES.map((template) => {
                    const subject = gammaSubjectBySlug(template.subjectSlug);
                    return (
                        <button
                            key={template.id}
                            type="button"
                            onClick={() => onUse(template.subjectSlug, template.title)}
                            className="group relative h-[220px] w-[168px] shrink-0 snap-start overflow-hidden rounded-[var(--gm-radius-lg)] text-left ring-1 ring-[var(--gm-border)] transition-[box-shadow,transform] duration-300 hover:-translate-y-1 hover:shadow-[var(--gm-shadow)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材 */}
                            <img src={template.cover} alt="" className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-110" />
                            <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[rgba(4,6,12,0.92)] via-[rgba(4,6,12,0.2)] to-transparent" />
                            <span className="absolute top-3 left-3 rounded-full bg-[rgba(4,6,12,0.55)] px-2 py-0.5 text-[11px] text-white backdrop-blur">{subject.name}</span>
                            <span className="absolute inset-x-3 bottom-3 flex flex-col gap-1.5 text-white">
                                <span className="text-sm font-semibold">{template.title}</span>
                                <span className="flex items-center justify-between text-[11px] text-white/70">
                                    {template.uses} 次使用
                                    <span className="inline-flex translate-y-1 items-center gap-0.5 font-medium text-[var(--gm-cyan)] opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
                                        使用 <ArrowUpRight className="size-3" />
                                    </span>
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>
        </GammaSection>
    );
}

/* ===== 本周创作者榜 ===== */

const CREATORS = [
    { name: "周屿", major: "影视摄影与制作", works: 42, likes: "18.6k", cover: `${THUMB}/cinematic.jpg` },
    { name: "林汐", major: "服装与服饰设计", works: 37, likes: "15.2k", cover: `${THUMB}/realistic.jpg` },
    { name: "顾川", major: "游戏美术", works: 29, likes: "12.9k", cover: `${THUMB}/dark-fantasy.jpg` },
    { name: "白芷", major: "动画", works: 33, likes: "11.4k", cover: `${THUMB}/anime.jpg` },
    { name: "陈默", major: "环境设计", works: 21, likes: "9.8k", cover: `${THUMB}/minimalist.jpg` },
] as const;

const RANK_STYLE = ["bg-[image:var(--gm-gradient)] text-white", "bg-[var(--gm-surface-3)] text-[var(--gm-text)]", "bg-[var(--gm-surface-3)] text-[var(--gm-text)]"];

export function GammaCreatorBoard({ onFollow }: { onFollow: (name: string) => void }) {
    return (
        <aside aria-labelledby="creators-title" className="relative flex flex-col overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] p-5 ring-1 ring-[var(--gm-border)]">
            <div aria-hidden className="pointer-events-none absolute -top-16 -right-10 size-44 rounded-full bg-[var(--gm-blue)] opacity-20 blur-3xl" />
            <header className="relative mb-3 flex items-center justify-between">
                <h2 id="creators-title" className="flex items-center gap-2 text-[15px] font-semibold">
                    <Crown className="size-4 text-[var(--gm-warning)]" />
                    本周创作者
                </h2>
                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--gm-text-3)]">
                    <Flame className="size-3 text-[var(--gm-danger)]" />
                    按获赞
                </span>
            </header>
            <ol className="relative flex flex-col gap-0.5">
                {CREATORS.map((creator, index) => (
                    <li key={creator.name} className="group flex items-center gap-3 rounded-[var(--gm-radius)] p-2 transition-colors hover:bg-[var(--gm-wash)]">
                        <span className={cn("grid size-6 shrink-0 place-items-center rounded-md font-mono text-[11px] font-semibold", RANK_STYLE[index] ?? "text-[var(--gm-text-3)]")}>{index + 1}</span>
                        {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意头像 */}
                        <img src={creator.cover} alt="" className="size-9 shrink-0 rounded-full object-cover ring-2 ring-[var(--gm-surface-2)]" />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">{creator.name}</span>
                            <span className="block truncate text-[11px] text-[var(--gm-text-3)]">
                                {creator.major} · {creator.works} 件
                            </span>
                        </span>
                        <span className="font-mono text-[11px] text-[var(--gm-text-2)] tabular-nums group-focus-within:hidden group-hover:hidden">{creator.likes}</span>
                        <button
                            type="button"
                            onClick={() => onFollow(creator.name)}
                            aria-label={`关注 ${creator.name}`}
                            className="hidden rounded-full bg-[var(--gm-accent-soft)] px-2.5 py-1 text-[11px] font-medium text-[var(--gm-accent)] group-focus-within:inline-flex group-hover:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
                        >
                            关注
                        </button>
                    </li>
                ))}
            </ol>
        </aside>
    );
}

/* ===== 精选短片 ===== */

export function GammaFeaturedReel({ onPlay }: { onPlay: () => void }) {
    return (
        <button
            type="button"
            onClick={onPlay}
            className="group relative isolate flex min-h-[300px] w-full flex-col justify-end overflow-hidden rounded-[var(--gm-radius-xl)] p-6 text-left ring-1 ring-[var(--gm-border)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)]"
        >
            {/* eslint-disable-next-line @next/next/no-img-element -- 静态示意素材 */}
            <img src={`${THUMB}/noir.jpg`} alt="" className="absolute inset-0 -z-10 size-full object-cover transition-transform duration-[1200ms] group-hover:scale-105" />
            <span aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-[rgba(4,6,12,0.95)] via-[rgba(4,6,12,0.35)] to-transparent" />
            <span className="gm-glass gm-glass-sheen absolute top-1/2 left-1/2 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-white transition-transform duration-300 group-hover:scale-110">
                <Play className="ml-1 size-6 fill-current" />
            </span>
            <span className="flex flex-col items-start gap-2 text-white">
                <GammaBadge tone="cyan">本周精选</GammaBadge>
                <span className="text-xl font-semibold">《雾港》· 毕业设计短片</span>
                <span className="text-[13px] text-white/70">影视摄影与制作 · 周屿 · 全片 4 分 12 秒，镜头全部由布鲁伽马生成</span>
            </span>
        </button>
    );
}

/* ===== 页脚 ===== */

const FOOTER_LINKS = [
    { title: "产品", links: ["专业方向", "工作台", "作品广场", "设计系统"] },
    { title: "院校", links: ["院校合作", "工作室空间", "毕设展", "教学案例"] },
    { title: "支持", links: ["帮助中心", "更新日志", "用户协议", "隐私政策"] },
];

export function GammaFooter({ onNavigate }: { onNavigate: (label: string) => void }) {
    return (
        <footer className="mt-6 border-t border-[var(--gm-border)] pt-10">
            <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
                <div className="flex flex-col gap-3">
                    <GammaLogo size={34} />
                    <p className="max-w-xs text-xs leading-relaxed text-[var(--gm-text-3)]">为设计与艺术专业打造的 AI 创作平台，从灵感到成片，一个工作台完成。</p>
                </div>
                {FOOTER_LINKS.map((column) => (
                    <nav key={column.title} aria-label={column.title} className="flex flex-col gap-2.5">
                        <span className="text-xs font-semibold text-[var(--gm-text)]">{column.title}</span>
                        {column.links.map((link) => (
                            <button key={link} type="button" onClick={() => onNavigate(link)} className="w-fit text-left text-xs text-[var(--gm-text-3)] transition-colors hover:text-[var(--gm-accent)]">
                                {link}
                            </button>
                        ))}
                    </nav>
                ))}
            </div>
            <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--gm-border)] py-5 text-[11px] text-[var(--gm-text-3)]">
                <span>© 2026 布鲁伽马 BlueGamma</span>
                <span className="font-mono">v2.0 · preview</span>
            </div>
        </footer>
    );
}
