import type { DramaAssetGenerationLayout } from "./drama-project-contract";

export function defaultDramaAssetGenerationLayout(kind: "characters" | "scenes" | "props"): DramaAssetGenerationLayout {
    return kind === "characters" ? "four_view" : "single";
}

export function normalizeDramaAssetGenerationLayout(kind: "characters" | "scenes" | "props", value: unknown): DramaAssetGenerationLayout {
    return value === "four_view" || value === "single" ? value : defaultDramaAssetGenerationLayout(kind);
}
