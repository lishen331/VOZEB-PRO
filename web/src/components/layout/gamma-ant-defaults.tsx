"use client";

import { Inbox } from "lucide-react";

/*
 * 布鲁伽马给 antd 的全局默认渲染：空状态与加载指示器。
 * 只在非画布编辑器路由通过 ConfigProvider 注入（见 app-providers.tsx），画布保持 antd 原样。
 */

/** 加载：品牌色圆环 */
export const gammaSpinIndicator = (
    <span aria-hidden className="inline-block size-[1em] animate-spin rounded-full border-2 border-[var(--gm-accent-soft)] border-t-[var(--gm-accent)] [animation-duration:0.8s]" />
);

/** 空状态：图标块 + 光晕；Table / List / Select 下拉等无数据时都用这个 */
export function GammaAntEmpty({ description = "暂无数据" }: { description?: string }) {
    return (
        <div className="relative flex flex-col items-center justify-center gap-2 py-6 text-center">
            <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 size-28 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--gm-blue)] opacity-10 blur-2xl" />
            <span className="relative grid size-9 place-items-center rounded-[10px] bg-[var(--gm-blue-soft)] text-[var(--gm-accent)] ring-1 ring-[var(--gm-accent-ring)]">
                <Inbox className="size-4" />
            </span>
            <span className="relative text-xs text-[var(--gm-text-3)]">{description}</span>
        </div>
    );
}
