"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export function AdminReturnButton() {
    const router = useRouter();

    useEffect(() => {
        router.prefetch("/create");
    }, [router]);

    return (
        <button
            type="button"
            className="admin-dashboard-return-button inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-xl border border-[var(--gm-border)] bg-[var(--gm-surface)] px-3 text-sm font-medium text-[var(--gm-text-2)] transition hover:border-[var(--gm-border-strong)] hover:text-[var(--gm-text)]"
            aria-label="返回 Agent 创作"
            onMouseEnter={() => router.prefetch("/create")}
            onFocus={() => router.prefetch("/create")}
            onClick={() => router.push("/create")}
        >
            <ArrowLeft className="size-4" />
            <span className="admin-dashboard-return-label">返回 Agent 创作</span>
        </button>
    );
}
