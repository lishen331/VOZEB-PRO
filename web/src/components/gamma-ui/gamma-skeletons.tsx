import type { ReactNode } from "react";

import "@/components/gamma-ui/gamma-effects.css";
import { cn } from "@/lib/utils";

/*
 * 按页面形状做的骨架屏：课程卡网格、作品瀑布流、备课三栏、列表行。
 * 占位块与真实内容同尺寸，加载完成时不跳动；整组标 aria-busy，读屏只念一次「加载中」。
 */

function Bone({ className, height }: { className?: string; height?: number }) {
    return <span aria-hidden className={cn("gm-skel block rounded-[8px]", className)} style={height ? { height } : undefined} />;
}

function Busy({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
    return (
        <div role="status" aria-busy="true" aria-label={label} className={className}>
            {children}
        </div>
    );
}

export function GammaCourseGridSkeleton({ count = 4 }: { count?: number }) {
    return (
        <Busy label="正在加载课程" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: count }, (_, index) => (
                <div key={index} className="overflow-hidden rounded-[var(--gm-radius-xl)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)]">
                    <Bone className="aspect-[16/9] rounded-none" />
                    <div className="flex flex-col gap-2 p-4">
                        <Bone className="h-4 w-3/4" />
                        <Bone className="h-3 w-1/2" />
                        <div className="mt-2 flex gap-3">
                            <Bone className="h-3 w-12" />
                            <Bone className="h-3 w-14" />
                        </div>
                        <Bone className="mt-1 h-1 w-full rounded-full" />
                    </div>
                </div>
            ))}
        </Busy>
    );
}

const MASONRY = [220, 300, 180, 260, 320, 200, 240, 280];

export function GammaMasonrySkeleton({ columns = 4 }: { columns?: number }) {
    return (
        <Busy label="正在加载作品">
            <div className="gap-3" style={{ columnCount: columns }}>
                {MASONRY.map((height, index) => (
                    <div key={index} className="mb-3 break-inside-avoid overflow-hidden rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)]">
                        <Bone className="rounded-none" height={height} />
                        <div className="flex items-center gap-2 p-3">
                            <Bone className="size-5 rounded-full" />
                            <Bone className="h-3 w-20" />
                            <Bone className="ml-auto h-3 w-8" />
                        </div>
                    </div>
                ))}
            </div>
        </Busy>
    );
}

export function GammaPrepSkeleton() {
    return (
        <Busy label="正在加载课件" className="grid h-[420px] grid-cols-[200px_1fr_260px] gap-4">
            <div className="flex flex-col gap-2">
                {Array.from({ length: 6 }, (_, index) => (
                    <div key={index} className="flex items-center gap-2 rounded-[12px] p-2">
                        <Bone className="size-6 rounded-full" />
                        <div className="flex flex-1 flex-col gap-1.5">
                            <Bone className="h-3 w-3/4" />
                            <Bone className="h-2.5 w-1/2" />
                        </div>
                    </div>
                ))}
            </div>
            <div className="flex flex-col gap-3">
                <Bone className="aspect-video w-full rounded-[var(--gm-radius-xl)]" />
                <div className="flex gap-2">
                    {Array.from({ length: 5 }, (_, index) => (
                        <Bone key={index} className="aspect-video flex-1 rounded-[10px]" />
                    ))}
                </div>
            </div>
            <div className="flex flex-col gap-3">
                <Bone className="h-8 w-full" />
                <Bone className="h-3 w-2/3" />
                <Bone className="h-3 w-5/6" />
                <Bone className="h-3 w-1/2" />
                <Bone className="mt-3 h-16 w-full" />
                <Bone className="h-16 w-full" />
            </div>
        </Busy>
    );
}

export function GammaListSkeleton({ rows = 4 }: { rows?: number }) {
    return (
        <Busy label="正在加载列表" className="flex flex-col divide-y divide-[var(--gm-border)] rounded-[var(--gm-radius-lg)] bg-[var(--gm-surface)] ring-1 ring-[var(--gm-border)]">
            {Array.from({ length: rows }, (_, index) => (
                <div key={index} className="flex items-center gap-3 p-3">
                    <Bone className="size-10 rounded-[10px]" />
                    <div className="flex flex-1 flex-col gap-1.5">
                        <Bone className="h-3.5 w-2/3" />
                        <Bone className="h-3 w-1/3" />
                    </div>
                    <Bone className="h-6 w-16 rounded-full" />
                </div>
            ))}
        </Busy>
    );
}
