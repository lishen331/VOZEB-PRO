"use client";

import type { ReactNode } from "react";

import type { FeatureModuleSettings } from "@/lib/feature-modules";

export function FeatureModuleGate({ children }: { children: ReactNode; initialFeatureModules?: FeatureModuleSettings }) {
    // Plugin switches control navigation/entry visibility only. Direct links
    // and existing workspaces remain usable; business APIs enforce their own
    // authentication, ownership, membership and input rules.
    return <>{children}</>;
}
