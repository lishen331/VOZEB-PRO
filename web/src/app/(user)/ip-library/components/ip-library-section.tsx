"use client";

import { Button } from "antd";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";

export function IpLibrarySection<T extends { id: string }>({
    title,
    description,
    items,
    renderItem,
    initialCount = 4,
    layout = "grid",
}: {
    title: string;
    description: string;
    items: T[];
    renderItem: (item: T) => ReactNode;
    initialCount?: number;
    layout?: "grid" | "list";
}) {
    const [expanded, setExpanded] = useState(false);
    if (!items.length) return null;
    const visible = expanded ? items : items.slice(0, initialCount);
    return (
        <section className="border-t border-border py-5 sm:py-7" data-ip-library-section={title}>
            <div className="flex min-w-0 items-end justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-base font-semibold text-foreground sm:text-lg">{title}</h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground sm:text-sm">{description}</p>
                </div>
                {items.length > initialCount ? (
                    <Button type="text" size="small" icon={expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />} onClick={() => setExpanded((value) => !value)}>
                        {expanded ? "收起" : "查看全部"}
                    </Button>
                ) : null}
            </div>
            <div className={layout === "list" ? "mt-3 grid min-w-0 gap-3" : "mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}>{visible.map(renderItem)}</div>
        </section>
    );
}
