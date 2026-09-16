"use client";

import type { ReactNode } from "react";
import { usePublicSessionStore } from "@/stores/use-public-session-store";
import { DRAMA_LAB_UI_FEATURES, isDramaLabUiFeatureEnabled } from "@/lib/feature-modules";

export function DramaLabUiFeature({ feature, children }: { feature: keyof typeof DRAMA_LAB_UI_FEATURES; children: ReactNode }) {
    const featureModules = usePublicSessionStore((state) => state.payload?.settings?.featureModules);
    return isDramaLabUiFeatureEnabled({ featureModules }, DRAMA_LAB_UI_FEATURES[feature]) ? <>{children}</> : null;
}
