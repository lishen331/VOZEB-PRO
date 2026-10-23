"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Copy, Search, Sparkles } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaBadge } from "@/components/gamma-ui/gamma-controls";
import { GammaEmptyState, GammaToastStack } from "@/components/gamma-ui/gamma-overlays";
import { GammaThemeProvider } from "@/components/gamma-ui/gamma-theme";
import { GAMMA_GALLERY } from "@/app/bluegamma/gamma-nav";
import { useGammaDemo } from "@/app/bluegamma/use-gamma-demo";

/**
 * 提示词库：用户是来读文字、挑句子用的，不是来看图的——
 * 单列列表、行高更松（py-6），每条给足提示词原文的呼吸空间，不用瀑布流卡片那套视觉。
 */
export function PromptsView() {
    const demo = useGammaDemo();
    const { toast } = demo;
    const [query, setQuery] = useState("");

    const items = useMemo(() => {
        const keyword = query.trim();
        return GAMMA_GALLERY.filter((item) => !keyword || [item.title, item.subject, item.prompt].some((field) => field.includes(keyword)));
    }, [query]);

    const copyPrompt = async (text: string) => {
        await navigator.clipboard?.writeText(text).catch(() => undefined);
        toast("success", "已复制提示词");
    };

    return (
        <GammaThemeProvider>
            <main className="h-full min-h-0 overflow-y-auto bg-[var(--gm-bg)]">
                <div className="mx-auto w-full max-w-3xl px-6 py-10 sm:px-8">
                    <Link href="/bluegamma/home" className="gm-glass mb-8 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm text-[var(--gm-text-2)] transition-colors hover:text-[var(--gm-text)]">
                        <ChevronLeft className="size-4" />
                        返回首页
                    </Link>

                    <header className="mb-10">
                        <h1 className="text-[28px] font-semibold tracking-tight">提示词库</h1>
                        <p className="mt-2 text-sm text-[var(--gm-text-3)]">来自 12 个专业的同学提示词，复制即可拿去生成</p>
                    </header>

                    <label className="mb-8 flex h-11 w-full items-center gap-2 rounded-[var(--gm-radius)] bg-[var(--gm-surface)] px-4 ring-1 ring-[var(--gm-border)] transition-shadow focus-within:shadow-[0_0_0_4px_var(--gm-accent-soft)] focus-within:ring-[var(--gm-accent)]">
                        <Search className="size-4 text-[var(--gm-text-3)]" />
                        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索提示词、作品或专业" className="h-full w-full bg-transparent text-sm text-[var(--gm-text)] outline-none placeholder:text-[var(--gm-text-3)]" />
                    </label>

                    {items.length ? (
                        <ul className="flex flex-col divide-y divide-[var(--gm-border)]">
                            {items.map((item) => (
                                <li key={item.id} className="flex flex-col gap-3 py-6">
                                    <div className="flex items-center gap-2">
                                        <GammaBadge tone="neutral">{item.subject}</GammaBadge>
                                        <h3 className="text-[15px] font-medium text-[var(--gm-text)]">{item.title}</h3>
                                        <span className="ml-auto text-xs text-[var(--gm-text-3)]">{item.author}</span>
                                    </div>
                                    <p className="text-sm leading-7 text-[var(--gm-text-2)]">{item.prompt}</p>
                                    <div>
                                        <GammaButton size="sm" variant="ghost" icon={<Copy className="size-3.5" />} onClick={() => copyPrompt(item.prompt)}>
                                            复制提示词
                                        </GammaButton>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <GammaEmptyState
                            icon={<Sparkles />}
                            title="没有找到相关提示词"
                            description="换个关键词试试"
                            action={
                                <GammaButton size="sm" variant="soft" onClick={() => setQuery("")}>
                                    清空搜索
                                </GammaButton>
                            }
                        />
                    )}
                </div>
            </main>
            <GammaToastStack toasts={demo.toasts} onDismiss={demo.dismissToast} />
        </GammaThemeProvider>
    );
}
