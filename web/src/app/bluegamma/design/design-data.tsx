"use client";

import { useState } from "react";

import { GammaBadge } from "@/components/gamma-ui/gamma-controls";
import { GammaAvatar, GammaAvatarGroup, GammaFileChip, GammaKbd, GammaPagination, GammaSkeleton, GammaTable, type GammaColumn } from "@/components/gamma-ui/gamma-data";
import { gammaSubjectBySlug } from "@/components/gamma-ui/gamma-subjects";
import { Specimen } from "@/app/bluegamma/design/design-components";
import { cn } from "@/lib/utils";

const THUMB = "/style-thumbs";
const TOTAL_PAGES = 12;

const MEMBERS = [
    { name: "周屿", src: `${THUMB}/cinematic.jpg` },
    { name: "林汐", src: `${THUMB}/realistic.jpg` },
    { name: "顾川", src: `${THUMB}/dark-fantasy.jpg` },
    { name: "白芷", src: `${THUMB}/anime.jpg` },
    { name: "陈默" },
    { name: "苏砚" },
    { name: "叶蓁" },
];

interface WorkRow {
    id: string;
    title: string;
    subjectSlug: string;
    status: "done" | "running" | "failed";
    cost: number;
    created: string;
}

const ROWS: readonly WorkRow[] = [
    { id: "w1", title: "新中式系列 · 第 3 套", subjectSlug: "fashion", status: "done", cost: 24, created: "10-14 11:20" },
    { id: "w2", title: "雾港 · 镜头 14", subjectSlug: "film", status: "running", cost: 52, created: "10-14 11:02" },
    { id: "w3", title: "侘寂客厅 · 午后", subjectSlug: "interior", status: "done", cost: 26, created: "10-13 21:45" },
    { id: "w4", title: "废弃神殿 · 场景", subjectSlug: "game-art", status: "failed", cost: 30, created: "10-13 19:12" },
];

const STATUS = {
    done: { tone: "success", label: "已完成" },
    running: { tone: "cyan", label: "生成中" },
    failed: { tone: "danger", label: "失败 · 已退款" },
} as const;

const COLUMNS: readonly GammaColumn<WorkRow>[] = [
    { key: "title", title: "作品", render: (row) => <span className="font-medium">{row.title}</span>, sortValue: (row) => row.title },
    { key: "subject", title: "专业", render: (row) => <span className="text-[var(--gm-text-2)]">{gammaSubjectBySlug(row.subjectSlug).name}</span> },
    { key: "status", title: "状态", render: (row) => <GammaBadge tone={STATUS[row.status].tone}>{STATUS[row.status].label}</GammaBadge> },
    { key: "cost", title: "积分", align: "right", render: (row) => <span className="font-mono">{row.cost}</span>, sortValue: (row) => row.cost },
    { key: "created", title: "时间", align: "right", render: (row) => <span className="font-mono text-[var(--gm-text-3)]">{row.created}</span>, sortValue: (row) => row.created },
];

const TIMELINE = [
    { time: "11:20", text: "林汐 发布了「新中式系列 · 第 3 套」", tone: "bg-[var(--gm-success)]" },
    { time: "11:02", text: "周屿 开始生成「雾港 · 镜头 14」", tone: "bg-[var(--gm-cyan)]" },
    { time: "10:48", text: "工作室「光影 Lab」新增 2 名成员", tone: "bg-[var(--gm-blue)]" },
    { time: "昨天", text: "顾川 的生成失败，积分已自动退回", tone: "bg-[var(--gm-danger)]" },
];

const INITIAL_FILES = [
    { name: "面料小样_宋锦.png", size: "2.4 MB", kind: "image" as const },
    { name: "分镜参考_雨夜.mp4", size: "18.6 MB", kind: "video" as const, progress: 64 },
];

export function DesignData() {
    const [page, setPage] = useState(4);
    const [files, setFiles] = useState(INITIAL_FILES);

    return (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Specimen title="头像与成员" note="hover 头像组展开">
                <div className="flex flex-col items-center gap-4">
                    <div className="flex items-center gap-3">
                        <GammaAvatar src={MEMBERS[0].src} name="周屿" size={44} status="online" />
                        <GammaAvatar src={MEMBERS[1].src} name="林汐" size={36} status="busy" />
                        <GammaAvatar name="陈默" size={30} />
                    </div>
                    <GammaAvatarGroup people={MEMBERS} />
                </div>
            </Specimen>
            <Specimen title="分页" note="当前页渐变块滑动">
                <div className="flex flex-col items-center gap-2">
                    <GammaPagination page={page} total={TOTAL_PAGES} onChange={setPage} />
                    <span className="font-mono text-[11px] text-[var(--gm-text-3)]">
                        第 {page} / {TOTAL_PAGES} 页
                    </span>
                </div>
            </Specimen>
            <Specimen title="文件与上传" note="底部进度条">
                <div className="flex flex-col gap-2">
                    {files.map((file) => (
                        <GammaFileChip key={file.name} {...file} onRemove={() => setFiles((list) => list.filter((item) => item.name !== file.name))} />
                    ))}
                    {files.length ? null : (
                        <button type="button" onClick={() => setFiles(INITIAL_FILES)} className="text-xs text-[var(--gm-accent)] hover:underline">
                            已全部移除 · 恢复
                        </button>
                    )}
                </div>
            </Specimen>
            <Specimen title="快捷键" note="键帽带底部厚度">
                <div className="flex flex-col gap-2.5 text-[13px] text-[var(--gm-text-2)]">
                    <span className="flex items-center gap-2">
                        <GammaKbd>Ctrl</GammaKbd>+<GammaKbd>K</GammaKbd> 打开搜索
                    </span>
                    <span className="flex items-center gap-2">
                        <GammaKbd>Ctrl</GammaKbd>+<GammaKbd>Enter</GammaKbd> 开始生成
                    </span>
                    <span className="flex items-center gap-2">
                        <GammaKbd>Esc</GammaKbd> 关闭浮层
                    </span>
                </div>
            </Specimen>
            <Specimen title="骨架屏" note="流光 1.6s">
                <div className="flex w-full max-w-[240px] gap-3">
                    <GammaSkeleton className="size-12 shrink-0 rounded-full" />
                    <div className="flex flex-1 flex-col gap-2 pt-1">
                        <GammaSkeleton className="h-3 w-4/5" />
                        <GammaSkeleton className="h-3 w-3/5" />
                        <GammaSkeleton className="h-3 w-2/5" />
                    </div>
                </div>
            </Specimen>
            <Specimen title="动态时间线" note="状态色点 + 竖线">
                <ol className="relative w-full max-w-[280px] border-l border-[var(--gm-border-strong)] pl-4">
                    {TIMELINE.map((item) => (
                        <li key={item.text} className="relative pb-3 last:pb-0">
                            <span aria-hidden className={cn("absolute top-1.5 -left-[21px] size-2 rounded-full ring-4 ring-[var(--gm-surface)]", item.tone)} />
                            <span className="block font-mono text-[10px] text-[var(--gm-text-3)]">{item.time}</span>
                            <span className="block text-xs text-[var(--gm-text-2)]">{item.text}</span>
                        </li>
                    ))}
                </ol>
            </Specimen>
            <div className="md:col-span-2 xl:col-span-3">
                <GammaTable columns={COLUMNS} rows={ROWS} />
                <p className="mt-2 text-[11px] text-[var(--gm-text-3)]">点击「作品 / 积分 / 时间」表头排序，再点一次反向。</p>
            </div>
        </div>
    );
}
