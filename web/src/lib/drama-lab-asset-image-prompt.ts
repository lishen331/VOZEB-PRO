import { buildDramaLabAssetFinalPrompt, dramaLabAssetPromptField } from "./drama-lab-asset-prompt-contract";
import type { DramaAssetVisualDetails, DramaAssetProfile } from "./drama-project-contract";

export function readDramaLabAssetVisualDetails(value: unknown): DramaAssetVisualDetails {
    if (!value || typeof value !== "object") return {};
    const input = value as Record<string, unknown>;
    const details: DramaAssetVisualDetails = {};
    for (const key of ["appearance", "imagePrompt", "polishedPrompt", "singleImagePrompt", "role", "type", "time"] as const) {
        const text = input[key];
        if (typeof text === "string" && text.trim()) details[key] = text.trim();
    }
    if (input.generationLayout === "single" || input.generationLayout === "four_view") details.generationLayout = input.generationLayout;
    if (Array.isArray(input.stages)) {
        const stages = input.stages.flatMap((item) => {
            if (!item || typeof item !== "object") return [];
            const stage = item as Record<string, unknown>;
            const range = Array.isArray(stage.episodeRange) ? stage.episodeRange.map(Number) : [];
            const appearance = typeof stage.appearance === "string" ? stage.appearance.trim() : "";
            return range.length === 2 && range.every((value) => Number.isFinite(value) && value >= 1) && appearance ? [{ episodeRange: [Math.floor(range[0]), Math.floor(range[1])] as [number, number], appearance }] : [];
        });
        if (stages.length) details.stages = stages;
    }
    return details;
}

export function buildDramaLabAssetImagePrompt(project: { style?: string; aspectRatio?: string }, asset: DramaAssetVisualDetails & { name?: string; description?: string; profile?: DramaAssetProfile }, kind: "characters" | "scenes" | "props") {
    const saved = dramaLabAssetPromptField(kind, asset);
    if (saved) return saved;
    const fallbackDescription = asset.imagePrompt?.trim() || (kind === "characters" ? asset.appearance?.trim() : "") || asset.description?.trim() || asset.name || "";
    return buildDramaLabAssetFinalPrompt(project, asset, kind, fallbackDescription);
}
