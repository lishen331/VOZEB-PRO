"use client";

import { ArrowLeft, CircleX } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { featureModuleDefinition, featureModuleForPathname, type FeatureModuleSettings } from "@/lib/feature-modules";
import { usePublicSessionStore } from "@/stores/use-public-session-store";

export function FeatureModuleGate({ children, initialFeatureModules }: { children: ReactNode; initialFeatureModules: FeatureModuleSettings }) {
    const pathname = usePathname();
    const liveFeatureModules = usePublicSessionStore((state) => state.payload?.settings?.featureModules);
    const featureModules = liveFeatureModules || initialFeatureModules;
    const moduleId = featureModuleForPathname(pathname);

    if (!moduleId || featureModules[moduleId] !== false) return <>{children}</>;

    const featureModule = featureModuleDefinition(moduleId);
    return (
        <main className="grid min-h-0 flex-1 place-items-center overflow-auto bg-white p-6 dark:bg-[#111316]">
            <section className="w-full max-w-md border border-border bg-card p-6 text-center shadow-sm">
                <div className="mx-auto grid size-11 place-items-center rounded-md bg-muted text-muted-foreground">
                    <CircleX className="size-5" />
                </div>
                <h1 className="mt-4 text-lg font-semibold">{featureModule.name} 暂未启用</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">该功能当前由平台管理员暂停使用。已有数据和已提交的任务不会被删除。</p>
                <Link href="/profile" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
                    <ArrowLeft className="size-4" /> 返回个人中心
                </Link>
            </section>
        </main>
    );
}
