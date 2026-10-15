import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

/** 紧凑空状态（布鲁伽马）：虚线框 + 品牌光晕图标块；非画布页使用，--gm-* 由 html.gm-app 提供 */
export function CompactEmptyState({ title, description, icon, action, className }: { title: string; description?: string; icon?: ReactNode; action?: ReactNode; className?: string }) {
    return (
        <div className={cn("relative flex min-h-16 items-center justify-center overflow-hidden rounded-[var(--gm-radius-lg,12px)] border border-dashed border-[var(--gm-border-strong,var(--border))] bg-[var(--gm-wash,transparent)] px-3 py-4 text-center", className)}>
            <div aria-hidden className="pointer-events-none absolute top-1/2 left-1/2 size-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--gm-blue,transparent)] opacity-10 blur-3xl" />
            <div className="relative flex max-w-md flex-col items-center">
                <span className="grid size-8 place-items-center rounded-[10px] bg-[var(--gm-blue-soft,var(--muted))] text-[var(--gm-accent,var(--muted-foreground))] ring-1 ring-[var(--gm-accent-ring,transparent)] [&_svg]:size-4">{icon || <Inbox />}</span>
                <div className="mt-2 text-sm font-medium text-foreground">{title}</div>
                {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
                {action ? <div className="mt-3">{action}</div> : null}
            </div>
        </div>
    );
}
