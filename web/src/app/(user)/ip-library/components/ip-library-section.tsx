"use client";

import { Button } from "antd";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, type ReactNode } from "react";

export function IpLibrarySection<T extends { id: string }>({ title, description, items, renderItem, initialCount = 4 }: { title: string; description: string; items: T[]; renderItem: (item: T) => ReactNode; initialCount?: number }) {
    const [expanded, setExpanded] = useState(false);
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
            {visible.length ? (
                <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{visible.map(renderItem)}</div>
            ) : (
                <p className="mt-3 border border-dashed border-border px-3 py-6 text-center text-sm text-muted-foreground">暂无内容</p>
            )}
        </section>
    );
}
