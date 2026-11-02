"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUp } from "lucide-react";

import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { cn } from "@/lib/utils";

/*
 * 作品流的两件滚动控件，首页作品区与 /gallery、/community 共用：
 *   1. <GalleryLoadMore>：哨兵进入视口自动续页，并保留一个可聚焦按钮兜底
 *   2. <BackToTopButton>：滚过首屏后从右下角浮出，点击滚回顶部
 * 这两个页面滚动的是各自的 <main> 而不是 window，所以两者都要拿到那个容器。
 */

/** 哨兵提前一屏触发，滚动时不会看到空白等待 */
const SENTINEL_ROOT_MARGIN = "600px 0px";
/** 滚动超过这个距离才显示回到顶部，约等于首屏完全滚出 */
const BACK_TO_TOP_THRESHOLD = 420;

export type GalleryInfiniteQuery = {
    hasNextPage: boolean;
    isFetchingNextPage: boolean;
    isFetchNextPageError: boolean;
    fetchNextPage: () => void;
};

/** 最近的纵向滚动容器：文档级滚动返回 null，交给 IntersectionObserver 用默认视口 */
export function findScrollParent(element: HTMLElement): HTMLElement | null {
    let node = element.parentElement;
    while (node && node !== document.body) {
        const overflowY = getComputedStyle(node).overflowY;
        if (overflowY === "auto" || overflowY === "scroll") return node;
        node = node.parentElement;
    }
    return null;
}

export function GalleryLoadMore({ query, loadedCount }: { query: GalleryInfiniteQuery; loadedCount: number }) {
    const sentinelRef = useRef<HTMLDivElement | null>(null);
    const { hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = query;

    const loadNext = useCallback(() => {
        if (!hasNextPage || isFetchingNextPage) return;
        fetchNextPage();
    }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel || !hasNextPage || typeof IntersectionObserver === "undefined") return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) loadNext();
            },
            { root: findScrollParent(sentinel), rootMargin: SENTINEL_ROOT_MARGIN },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [hasNextPage, loadNext]);

    const statusText = isFetchingNextPage ? `正在加载更多作品 · 已显示 ${loadedCount} 个` : hasNextPage ? "" : `已经到底了 · 共 ${loadedCount} 个作品`;

    return (
        <div className="flex flex-col items-center gap-2 pt-2 sm:pt-4">
            <div ref={sentinelRef} aria-hidden className="h-px w-full" />
            <p aria-live="polite" className="text-xs text-[var(--gm-text-3)]">
                {statusText}
            </p>
            {isFetchNextPageError ? (
                <div className="flex items-center gap-2">
                    <span className="text-xs text-[var(--gm-danger)]">加载更多失败</span>
                    <GammaButton size="sm" variant="soft" onClick={loadNext}>
                        重试
                    </GammaButton>
                </div>
            ) : hasNextPage ? (
                <GammaButton size="sm" variant="ghost" loading={isFetchingNextPage} onClick={loadNext}>
                    加载更多
                </GammaButton>
            ) : null}
        </div>
    );
}

/**
 * 监听锚点元素所在的滚动容器，滚过阈值后返回 true。
 * 传入 containerRef 时把解析到的容器写回，供 BackToTopButton 滚回顶部。
 */
export function useBackToTopVisible(anchorRef: RefObject<HTMLElement | null>, containerRef?: RefObject<HTMLElement | null>) {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const anchor = anchorRef.current;
        if (!anchor) return;
        const container = findScrollParent(anchor) || (document.scrollingElement as HTMLElement | null);
        if (!container) return;
        if (containerRef) containerRef.current = container;
        const onScroll = () => setVisible(container.scrollTop > BACK_TO_TOP_THRESHOLD);
        onScroll();
        container.addEventListener("scroll", onScroll, { passive: true });
        return () => container.removeEventListener("scroll", onScroll);
    }, [anchorRef, containerRef]);
    return visible;
}

/** 回到顶部：玻璃胶囊 + 品牌描边，固定在视口右下，不随内容滚走 */
export function BackToTopButton({ visible, containerRef }: { visible: boolean; containerRef: RefObject<HTMLElement | null> }) {
    const reduce = useReducedMotion();
    const scrollToTop = () => {
        containerRef.current?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
    };
    return (
        <AnimatePresence>
            {visible ? (
                <motion.button
                    type="button"
                    onClick={scrollToTop}
                    aria-label="回到顶部"
                    title="回到顶部"
                    initial={{ opacity: 0, y: 12, scale: 0.92 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 12, scale: 0.92 }}
                    transition={{ duration: reduce ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className={cn(
                        "fixed right-5 bottom-5 z-40 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[13px] font-medium",
                        "bg-[color-mix(in_srgb,var(--gm-surface-2)_82%,transparent)] text-[var(--gm-text-2)] ring-1 ring-[var(--gm-border-strong)] backdrop-blur-xl",
                        "transition-colors hover:text-[var(--gm-accent)] hover:ring-[var(--gm-accent)]",
                        "focus-visible:text-[var(--gm-accent)] focus-visible:ring-2 focus-visible:ring-[var(--gm-accent)] focus-visible:outline-none lg:right-8 lg:bottom-8",
                    )}
                    style={{ boxShadow: "var(--gm-shadow)" }}
                >
                    <ArrowUp className="size-3.5" aria-hidden />
                    回到顶部
                </motion.button>
            ) : null}
        </AnimatePresence>
    );
}
