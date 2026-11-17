"use client";

import { CompactOptionGroup } from "@/components/creative-generation-preferences";
import type { CreativeModelCapabilityProfile } from "@/lib/creative-model-capabilities";
import { canvasVideoGenerationModes, type CanvasVideoGenerationMode } from "@/lib/video-reference-contract";

import type { CanvasNodeMetadata } from "../types";
import { canvasVideoGenerationModeHint, canvasVideoGenerationModeLabel, canvasVideoGenerationModePatch, normalizeCanvasVideoGenerationMode } from "../utils/canvas-video-references";

const videoGenerationModeOptions: readonly { value: CanvasVideoGenerationMode; label: string; tooltip: string }[] = canvasVideoGenerationModes.map((mode) => ({
    value: mode,
    label: canvasVideoGenerationModeLabel(mode),
    tooltip: canvasVideoGenerationModeHint(mode),
}));

export function CanvasVideoModeSelector({
    metadata,
    capabilityProfile,
    onChange,
    onConflict,
}: {
    metadata?: CanvasNodeMetadata;
    capabilityProfile?: CreativeModelCapabilityProfile;
    onChange: (patch: Partial<CanvasNodeMetadata>) => void;
    onConflict?: (message: string) => void;
}) {
    const currentMode = normalizeCanvasVideoGenerationMode(metadata?.videoGenerationMode);
    const handleChange = (mode: CanvasVideoGenerationMode) => {
        // H3: first_last mode is incompatible with omni_reference references that carry audio/video.
        // The rule is enforced at submit time too; here we surface a soft reminder on mode switch.
        if (capabilityProfile?.videoRatioMode === "adaptive_in_keyframe" && mode === "omni_reference") {
            onConflict?.("全能参考模式下首帧比例由输入图片决定（自适应），不会使用比例选择器的值。");
        }
        onChange(canvasVideoGenerationModePatch(mode));
    };
    return <CompactOptionGroup label="视频生成模式" ariaLabel="选择视频生成模式" value={currentMode} options={videoGenerationModeOptions} columns={5} onChange={handleChange} />;
}
