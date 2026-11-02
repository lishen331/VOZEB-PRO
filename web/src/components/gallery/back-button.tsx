"use client";

import { ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";

/*
 * 通用「返回上一级」。直接从外部链接打开详情页时没有可回退的历史，
 * 此时退到 fallbackHref（作品详情默认回作品广场），避免按钮点了没反应。
 */
export function BackButton({ fallbackHref = "/gallery", label = "返回上一级", className }: { fallbackHref?: string; label?: string; className?: string }) {
    const router = useRouter();
    const goBack = () => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push(fallbackHref);
    };
    return (
        <button
            type="button"
            onClick={goBack}
            aria-label={label}
            title={label}
            className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1 rounded-[var(--gm-radius-sm)] px-2.5 text-[13px] text-[var(--gm-text-2)]",
                "transition-colors hover:bg-[var(--gm-wash)] hover:text-[var(--gm-text)]",
                "focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:outline-none",
                className,
            )}
        >
            <ChevronLeft className="size-4" aria-hidden />
            {label}
        </button>
    );
}
