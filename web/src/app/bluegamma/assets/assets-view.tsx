"use client";

import { useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import Link from "next/link";
import { ChevronLeft, Search } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaWorkCard } from "@/components/gamma-ui/gamma-cards";
import { GammaTabs } from "@/components/gamma-ui/gamma-controls";
import { GammaEmptyState } from "@/components/gamma-ui/gamma-overlays";
import { GammaThemeProvider } from "@/components/gamma-ui/gamma-theme";
import { GammaToastStack } from "@/components/gamma-ui/gamma-overlays";
import { GAMMA_GALLERY } from "@/app/bluegamma/gamma-nav";
import { useGammaDemo } from "@/app/bluegamma/use-gamma-demo";
import { cn } from "@/lib/utils";

type AssetKind = "all" | "image" | "video";

const KIND_TABS = [
    { value: "all" as const, label: "全部" },
    { value: "image" as const, label: "图片" },
    { value: "video" as const, label: "视频" },
];

/**
 * 我的素材：用户是在慢慢挑看自己攒下的素材，不是高频赶任务，
 * 所以跟 studio（工作台）刻意不同——顶部留白更大、瀑布流列间距更宽（gap-5 而不是 gap-3/4）。
 */
export function AssetsView() {
    const demo = useGammaDemo();
    const { toast } = demo;
    const [kind, setKind] = useState<AssetKind>("all");
    const [query, setQuery] = useState("");

    const items = useMemo(() => {
        const keyword = query.trim();
        return GAMMA_GALLERY.filter((item) => (kind === "all" || item.kind === kind) && (!keyword || [item.title, item.subject].some((field) => field.includes(keyword))));
    }, [kind, query]);

    return (
        <GammaThemeProvider>
            <main className="h-full min-h-0 overflow-y-auto bg-[var(--gm-bg)]">
                <div className="mx-auto w-full max-w-6xl px-6 py-10 sm:px-8">
                    <Link href="/bluegamma/home" className="gm-glass mb-8 inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm text-[var(--gm-text-2)] transition-colors hover:text-[var(--gm-text)]">
                        <ChevronLeft className="size-4" />
                        返回首页
                    </Link>

                    <header className="mb-10">
                        <h1 className="text-[28px] font-semibold tracking-tight">我的素材</h1>
                        <p className="mt-2 text-sm text-[var(--gm-text-3)]">生成过的角色、场景、道具都会存在这里，留着下次复用</p>
                    </header>

                    <div className="mb-8 flex flex-wrap items-center gap-5">
                        <GammaTabs label="素材类型" options={KIND_TABS} value={kind} onChange={setKind} />
                        <span aria-hidden className="h-6 w-px bg-[var(--gm-border-strong)]" />
                        <label className="flex h-10 w-80 items-center gap-2 rounded-[var(--gm-radius)] bg-[var(--gm-surface)] px-3 ring-1 ring-[var(--gm-border)] transition-shadow focus-within:shadow-[0_0_0_4px_var(--gm-accent-soft)] focus-within:ring-[var(--gm-accent)]">
                            <Search className="size-4 text-[var(--gm-text-3)]" />
                            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索素材标题" className="h-full w-full bg-transparent text-sm text-[var(--gm-text)] outline-none placeholder:text-[var(--gm-text-3)]" />
                        </label>
                    </div>

                    {items.length ? (
                        <div className="columns-2 gap-5 md:columns-3 xl:columns-4">
                            <AnimatePresence>
                                {items.map((item) => (
                                    <GammaWorkCard
                                        key={item.id}
                                        cover={item.cover}
                                        title={item.title}
                                        author={item.author}
                                        subject={item.subject}
                                        likes={item.likes}
                                        kind={item.kind}
                                        tall={item.tall}
                                        onOpen={() => toast("info", `预览「${item.title}」（演示）`)}
                                        onRemix={() => toast("success", `已用「${item.title}」的参数新建生成任务`)}
                                    />
                                ))}
                            </AnimatePresence>
                        </div>
                    ) : (
                        <GammaEmptyState
                            icon={<Search />}
                            title="没有找到相关素材"
                            description="换个关键词，或切回「全部」看看"
                            action={
                                <GammaButton
                                    size="sm"
                                    variant="soft"
                                    onClick={() => {
                                        setQuery("");
                                        setKind("all");
                                    }}
                                >
                                    清空筛选
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
