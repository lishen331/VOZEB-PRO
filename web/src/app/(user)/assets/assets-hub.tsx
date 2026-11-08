"use client";

import { useRouter, useSearchParams } from "next/navigation";

import MyAssetsPage from "./my-assets-page";
import { PublicAssetsTab } from "./public-assets-tab";

export function AssetsHub() {
    const router = useRouter();
    const params = useSearchParams();
    const activeKey = params.get("tab") === "public" ? "public" : "mine";
    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--gm-bg)] text-[var(--gm-text)]" data-testid="assets-hub">
            <div className="shrink-0 border-b border-[var(--gm-border)] px-3 pt-2 sm:px-6">
                <div role="tablist" aria-label="素材类型" className="flex gap-2">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeKey === "mine"}
                        onClick={() => router.replace("/assets", { scroll: false })}
                        className={activeKey === "mine" ? "rounded-t-md border-b-2 border-[var(--gm-accent)] px-3 py-2 text-sm font-semibold" : "rounded-t-md px-3 py-2 text-sm text-[var(--gm-text-3)] hover:text-[var(--gm-text)]"}
                    >
                        我的素材
                    </button>
                    <button
                        type="button"
                        role="tab"
                        aria-selected={activeKey === "public"}
                        onClick={() => router.replace("/assets?tab=public", { scroll: false })}
                        className={activeKey === "public" ? "rounded-t-md border-b-2 border-[var(--gm-accent)] px-3 py-2 text-sm font-semibold" : "rounded-t-md px-3 py-2 text-sm text-[var(--gm-text-3)] hover:text-[var(--gm-text)]"}
                    >
                        公共素材
                    </button>
                </div>
            </div>
            <div className="min-h-0 flex-1 overflow-hidden">{activeKey === "public" ? <PublicAssetsTab /> : <MyAssetsPage />}</div>
        </div>
    );
}
