import { ArrowUpRight, BookOpenText } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

/*
 * 空态里的「上手说明」入口。
 *
 * 用空态而不是蒙层聚光灯：空态本身就是用户卡住的那一刻，语境最准；
 * 不依赖 DOM 坐标，窗口缩放、侧栏折叠、手机抽屉都不会错位；
 * 文案过期只改一行，不用做引导状态迁移。
 *
 * section 对应帮助中心文章的 id（help-content.ts 里 helpArticles[].id）。
 */
export const GUIDE_SECTIONS = {
    canvas: "canvas",
    drama: "drama",
    agent: "agent",
    assets: "assets",
} as const;

export type GuideSection = (typeof GUIDE_SECTIONS)[keyof typeof GUIDE_SECTIONS];

export function GuideLink({ section, label = "第一次用？看 30 秒上手说明", className }: { section: GuideSection; label?: string; className?: string }) {
    return (
        <Link
            href={`/help?section=${section}`}
            className={cn(
                "inline-flex items-center gap-1 rounded-[var(--gm-radius-sm)] px-1.5 py-1 text-xs text-[var(--gm-text-3)]",
                "transition-colors hover:text-[var(--gm-accent)]",
                "focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:outline-none",
                className,
            )}
        >
            <BookOpenText className="size-3.5" aria-hidden />
            {label}
            <ArrowUpRight className="size-3" aria-hidden />
        </Link>
    );
}
