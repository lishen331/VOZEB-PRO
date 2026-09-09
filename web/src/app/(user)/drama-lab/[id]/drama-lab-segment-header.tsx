"use client";

import type { StoryboardShotGroup } from "@/lib/drama-lab-storyboard-groups";

type Props = {
    group: StoryboardShotGroup;
    expanded: boolean;
    controlsId: string;
    onToggle: () => void;
};

export function DramaLabSegmentHeader({ group, expanded, controlsId, onToggle }: Props) {
    return (
        <h3 className="border-b border-border bg-muted/30 px-3 py-2">
            <button type="button" className="flex w-full min-w-0 flex-wrap items-center gap-2 text-left" aria-expanded={expanded} aria-controls={controlsId} onClick={onToggle}>
                <span aria-hidden="true" className="text-muted-foreground">
                    {expanded ? "▾" : "▸"}
                </span>
                <span className="min-w-0 break-words font-medium">{group.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{group.rangeLabel}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{group.shots.length} 个镜头</span>
                <span className="sr-only">{expanded ? "收起" : "展开"}</span>
            </button>
        </h3>
    );
}
