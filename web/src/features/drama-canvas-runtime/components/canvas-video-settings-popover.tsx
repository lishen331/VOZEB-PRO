"use client";

import { App } from "antd";

import { CANVAS_UI_FEATURES, isCanvasUiFeatureEnabled } from "@/lib/canvas-ui-features";
import { usePublicSessionStore } from "@/stores/use-public-session-store";

import { SlidersHorizontal } from "lucide-react";

import { CreativeGenerationPreferences, generationPreferenceSummary, type CreativeGenerationPreferencePatch } from "@/components/creative-generation-preferences";
import { useCreativeComposerPopoverPlacement, type CreativeComposerPopoverPlacement } from "@/components/creative-composer-popover";
import { canvasThemes } from "@/lib/canvas-theme";
import type { CreativeGenerationPreferences as GenerationPreferences } from "@/lib/creative-runtime-contract";
import { boolConfig } from "@/lib/seedance-video";
import type { AiConfig } from "@/stores/use-config-store";
import { useCanvasColorTheme } from "@/stores/use-theme-store";

import type { CanvasNodeMetadata } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { canvasVideoGenerationModeLabel, canvasVideoReferenceModeLabel, normalizeCanvasVideoGenerationMode, normalizeCanvasVideoReferenceMode } from "../utils/canvas-video-references";
import { canvasModelCapabilityProfile } from "../utils/canvas-model-capabilities";
import type { CreativeModelCapabilityProfile } from "@/lib/creative-model-capabilities";
import { CanvasVideoReferenceSettings } from "./canvas-video-reference-settings";
import { CanvasVideoModeSelector } from "./canvas-video-mode-selector";

type CanvasVideoSettingsPopoverProps = {
    config: AiConfig;
    capabilityProfile?: CreativeModelCapabilityProfile;
    metadata?: CanvasNodeMetadata;
    references: CanvasResourceReference[];
    onConfigChange: (key: keyof AiConfig, value: string) => void;
    onMetadataChange: (patch: Partial<CanvasNodeMetadata>) => void;
    buttonClassName?: string;
    placement?: CreativeComposerPopoverPlacement;
};

export function CanvasVideoSettingsPopover({ config, capabilityProfile: capabilityProfileOverride, metadata, references, onConfigChange, onMetadataChange, buttonClassName, placement = "topLeft" }: CanvasVideoSettingsPopoverProps) {
    const theme = canvasThemes[useCanvasColorTheme().theme];
    const responsivePlacement = useCreativeComposerPopoverPlacement(placement);
    const customResolutionEnabled = usePublicSessionStore((state) => isCanvasUiFeatureEnabled(state.payload?.settings?.featureModules, CANVAS_UI_FEATURES.videoCustomResolution));
    const { modal } = App.useApp();
    const capabilityProfile = capabilityProfileOverride || canvasModelCapabilityProfile(config);

    const preferences: GenerationPreferences = {
        mode: "video",
        video: {
            size: config.size || "auto",
            quality: config.vquality || "auto",
            seconds: positiveInteger(config.videoSeconds, 5),
            generateAudio: boolConfig(config.videoGenerateAudio, true),
            watermark: boolConfig(config.videoWatermark, false),
            referenceMode: normalizeCanvasVideoReferenceMode(metadata?.videoReferenceMode),
        },
    };
    const modeLabel = canvasVideoGenerationModeLabel(metadata?.videoGenerationMode);
    const summary = canvasVideoPreferenceSummary(preferences, modeLabel);
    const fullSummary = generationPreferenceSummary("video", preferences);
    const referenceLabel = canvasVideoReferenceModeLabel(metadata?.videoReferenceMode);

    const showConflictNotice = (message: string) => {
        modal.info({ title: "注意", content: message, okText: "知道了" });
    };

    // Prompt expansion: show switch only for H3 models that declare the modes.
    const promptExpansionModes = capabilityProfile?.promptExpansionModes;
    const promptExpansionContent = promptExpansionModes?.length ? <PromptExpansionSwitch modes={promptExpansionModes} value={config.videoPromptExpansion || ""} onChange={(v) => onConfigChange("videoPromptExpansion", v)} /> : null;

    return (
        <CreativeGenerationPreferences
            capability="video"
            allowCustomResolution={customResolutionEnabled}
            canvasResolutionPresets
            preferences={preferences}
            capabilityProfile={capabilityProfile}
            triggerLabel={summary}
            triggerAriaLabel={`视频设置：${referenceLabel} · ${fullSummary}`}
            triggerIcon={<SlidersHorizontal className="size-4" />}
            triggerClassName={buttonClassName}
            triggerLabelClassName="whitespace-nowrap text-left !overflow-visible !text-clip"
            placement={responsivePlacement}
            autoAdjustOverflow
            showCount={false}
            videoReferenceContent={<CanvasVideoReferenceSettings metadata={metadata} references={references} theme={theme} compact onChange={onMetadataChange} />}
            videoModeContent={
                <>
                    <CanvasVideoModeSelector metadata={metadata} capabilityProfile={capabilityProfile} onChange={onMetadataChange} onConflict={showConflictNotice} />
                    {promptExpansionContent}
                </>
            }
            onChange={(patch) => applyVideoPreferencePatch(patch, onConfigChange)}
        />
    );
}

function PromptExpansionSwitch({ modes, value, onChange }: { modes: string[]; value: string; onChange: (v: string) => void }) {
    const labels: Record<string, string> = { disabled: "关闭扩写", balanced: "均衡扩写", quality: "质量优先" };
    const current = modes.includes(value) ? value : modes.includes("balanced") ? "balanced" : modes[0];
    return (
        <div className="mt-1.5 grid gap-1.5">
            <p className="text-[11px] font-medium text-[#7b8591] dark:text-[#98a2ae]">提示词扩写（H3 专属）</p>
            <div className="flex gap-1.5">
                {modes.map((mode) => (
                    <button
                        key={mode}
                        type="button"
                        className={`h-7 flex-1 rounded-lg px-1 text-[11px] transition ${current === mode ? "bg-[#eaf1f5] font-medium text-[#315d78] dark:bg-[#2a3b46] dark:text-[#a8c8dc]" : "bg-[#f5f6f7] text-[#687481] hover:bg-[#edf0f2] dark:bg-[#24282e] dark:text-[#a6afb9] dark:hover:bg-[#30363e]"}`}
                        onClick={() => onChange(mode)}
                        aria-pressed={current === mode}
                    >
                        {labels[mode] ?? mode}
                    </button>
                ))}
            </div>
        </div>
    );
}

export function canvasVideoPreferenceSummary(preferences: GenerationPreferences, modeLabel?: string) {
    const video = preferences.video;
    const size = !video?.size || video.size === "auto" ? "智能" : video.size.replace("x", "×");
    if (/^\d+x\d+$/i.test(video?.size || "")) return modeLabel ? `${modeLabel} · ${size}` : size;
    const quality = !video?.quality || video.quality === "auto" ? "智能" : `${video.quality.replace(/p$/i, "")}P`;
    return modeLabel ? `${modeLabel} · ${size} · ${quality}` : `${size} · ${quality}`;
}

function applyVideoPreferencePatch(patch: CreativeGenerationPreferencePatch, onChange: (key: keyof AiConfig, value: string) => void) {
    if (patch.size !== undefined) onChange("size", patch.size);
    if (patch.quality !== undefined) onChange("vquality", patch.quality);
    if (patch.seconds !== undefined) onChange("videoSeconds", String(patch.seconds));
    if (patch.generateAudio !== undefined) onChange("videoGenerateAudio", String(patch.generateAudio));
}

function positiveInteger(value: unknown, fallback: number) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
