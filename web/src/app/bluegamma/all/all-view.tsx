"use client";

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { GammaNavIcon, type GammaNavIconName } from "@/components/gamma-ui/gamma-nav-icon";
import { GammaThemeProvider } from "@/components/gamma-ui/gamma-theme";

interface AllEntry {
    icon: GammaNavIconName;
    label: string;
    href?: string;
}

const GROUPS: readonly { title: string; entries: readonly AllEntry[] }[] = [
    {
        title: "创作",
        entries: [
            { icon: "subjects", label: "专业方向" },
            { icon: "canvas", label: "无限画布" },
            { icon: "courseware", label: "工作台", href: "/bluegamma/studio" },
            { icon: "film", label: "一键成片" },
            { icon: "drama", label: "短剧制作" },
        ],
    },
    {
        title: "资产",
        entries: [
            { icon: "assets", label: "我的素材", href: "/bluegamma/assets" },
            { icon: "prompts", label: "提示词库", href: "/bluegamma/prompts" },
            { icon: "library", label: "我的提示词" },
        ],
    },
    {
        title: "社区",
        entries: [
            { icon: "plaza", label: "作品广场", href: "/bluegamma/home" },
            { icon: "classes", label: "工作室", href: "/bluegamma/studios" },
            { icon: "ip", label: "IP 库" },
            { icon: "profile", label: "我的主页" },
        ],
    },
    {
        title: "学校身份",
        entries: [
            { icon: "learning", label: "学习中心" },
            { icon: "teaching", label: "教学中心" },
            { icon: "practice", label: "无限练习", href: "/bluegamma/practice" },
            { icon: "school", label: "学校管理" },
        ],
    },
];

/** 全部入口：汇总侧栏收不下的所有模块，网格密一点（高频查找场景，不需要留白） */
export function AllView() {
    return (
        <GammaThemeProvider>
            <main className="h-full min-h-0 overflow-y-auto bg-[var(--gm-bg)]">
                <div className="mx-auto w-full max-w-4xl px-6 py-10 sm:px-8">
                    <Link href="/bluegamma/home" className="gm-glass mb-8 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm text-[var(--gm-text-2)] transition-colors hover:text-[var(--gm-text)]">
                        <ChevronLeft className="size-4" />
                        返回首页
                    </Link>

                    <header className="mb-8">
                        <h1 className="text-[28px] font-semibold tracking-tight">全部</h1>
                        <p className="mt-2 text-sm text-[var(--gm-text-3)]">按身份与权限显示；已设计的入口可以直接点进去</p>
                    </header>

                    <div className="flex flex-col gap-8">
                        {GROUPS.map((group) => (
                            <section key={group.title}>
                                <p className="mb-3 text-xs font-medium text-[var(--gm-text-3)]">{group.title}</p>
                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5">
                                    {group.entries.map((entry) =>
                                        entry.href ? (
                                            <Link
                                                key={entry.label}
                                                href={entry.href}
                                                className="flex flex-col items-center gap-2 rounded-[var(--gm-radius-lg)] py-4 ring-1 ring-[var(--gm-border)] transition-colors hover:bg-[var(--gm-wash)] hover:ring-[var(--gm-border-strong)]"
                                            >
                                                <GammaNavIcon name={entry.icon} size={24} className="text-[var(--gm-accent)]" />
                                                <span className="text-xs text-[var(--gm-text-2)]">{entry.label}</span>
                                            </Link>
                                        ) : (
                                            <div key={entry.label} className="flex flex-col items-center gap-2 rounded-[var(--gm-radius-lg)] py-4 ring-1 ring-[var(--gm-border)] opacity-50">
                                                <GammaNavIcon name={entry.icon} size={24} className="text-[var(--gm-text-3)]" />
                                                <span className="text-xs text-[var(--gm-text-3)]">{entry.label}</span>
                                            </div>
                                        ),
                                    )}
                                </div>
                            </section>
                        ))}
                    </div>
                </div>
            </main>
        </GammaThemeProvider>
    );
}
