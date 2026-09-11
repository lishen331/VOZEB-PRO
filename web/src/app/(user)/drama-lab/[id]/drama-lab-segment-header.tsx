"use client";

import type { StoryboardShotGroup } from "@/lib/drama-lab-storyboard-groups";

type Props = {
    group: StoryboardShotGroup;
    /** Legacy props are accepted for compatibility but group headers are informational only. */
    expanded?: boolean;
    controlsId?: string;
    onToggle?: () => void;
};

export function DramaLabSegmentHeader({ group }: Props) {
    return (
        <h3 className="border-b border-border bg-muted/30 px-3 py-2">
            <div className="flex w-full min-w-0 flex-wrap items-center gap-2 text-left">
                <span className="min-w-0 break-words font-medium">{group.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{group.rangeLabel}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{group.shots.length} 个镜头</span>
            </div>
        </h3>
    );
}
