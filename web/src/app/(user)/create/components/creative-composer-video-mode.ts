import type { CreativeGenerationMode, CreativeGenerationPreferences } from "@/lib/creative-runtime-contract";

export function shouldShowVideoFrameControls(creationMode: "agent" | CreativeGenerationMode, preferences: CreativeGenerationPreferences) {
    const effectiveMode = creationMode === "agent" ? preferences.mode : creationMode;
    return effectiveMode === "video" && preferences.video?.referenceMode !== undefined && preferences.video.referenceMode !== "reference";
}

export function applyAgentGenerationCapability(creationMode: "agent" | CreativeGenerationMode, capability: CreativeGenerationMode, preferences: CreativeGenerationPreferences) {
    if (creationMode !== "agent") return preferences;
    const { mode: _mode, ...parameters } = preferences;
    return parameters;
}
