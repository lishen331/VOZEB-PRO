"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

import { featureModuleForPathname, type FeatureModuleSettings } from "@/lib/feature-modules";
import { usePublicSessionStore } from "@/stores/use-public-session-store";

export function FeatureModuleGate({ children, initialFeatureModules }: { children: ReactNode; initialFeatureModules: FeatureModuleSettings }) {
    const pathname = usePathname();
    const router = useRouter();
    const liveFeatureModules = usePublicSessionStore((state) => state.payload?.settings?.featureModules);
    const featureModules = liveFeatureModules || initialFeatureModules;
    const moduleId = featureModuleForPathname(pathname);
    const disabled = Boolean(moduleId && featureModules[moduleId] === false);
    const fallback = featureModules.practice !== false ? "/practice" : "/profile";

    useEffect(() => {
        if (disabled && pathname !== fallback) router.replace(fallback);
    }, [disabled, fallback, pathname, router]);

    return disabled ? null : <>{children}</>;
}
