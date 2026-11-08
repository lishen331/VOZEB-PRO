"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { MyPromptsPage } from "@/components/my-prompts/my-prompts-page";
import PublicPromptsPage from "./public-prompts-page";

export function PromptHub({ canViewMine, canViewPublic }: { canViewMine: boolean; canViewPublic: boolean }) {
    const router = useRouter();
    const params = useSearchParams();
    const requestedTab = params.get("tab");
    const activeKey = requestedTab === "mine" && canViewMine ? "mine" : canViewPublic ? "public" : "mine";
    const selectTab = (key: "mine" | "public") => router.replace(key === "mine" ? "/prompts?tab=mine" : "/prompts", { scroll: false });

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--gm-bg)] text-[var(--gm-text)]" data-testid="prompt-hub">
            {canViewMine && canViewPublic ? (
                <div className="shrink-0 border-b border-[var(--gm-border)] px-3 pt-2 sm:px-6" role="tablist" aria-label="提示词类型">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeKey === "mine"}
                        onClick={() => selectTab("mine")}
                        className={activeKey === "mine" ? "rounded-t-md border-b-2 border-[var(--gm-accent)] px-3 py-2 text-sm font-semibold" : "rounded-t-md px-3 py-2 text-sm text-[var(--gm-text-3)] hover:text-[var(--gm-text)]"}
                    >
                        我的提示词
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeKey === "public"}
                        onClick={() => selectTab("public")}
                        className={activeKey === "public" ? "rounded-t-md border-b-2 border-[var(--gm-accent)] px-3 py-2 text-sm font-semibold" : "rounded-t-md px-3 py-2 text-sm text-[var(--gm-text-3)] hover:text-[var(--gm-text)]"}
                    >
                        公共提示词
                    </button>
                </div>
            ) : null}
            <div className="min-h-0 flex-1 overflow-hidden">{activeKey === "mine" ? <MyPromptsPage /> : <PublicPromptsPage />}</div>
        </div>
    );
}
