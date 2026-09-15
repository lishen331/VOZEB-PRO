"use client";

import { CompactOptionGroup } from "@/components/creative-generation-preferences";
import { canvasVideoGenerationModes, type CanvasVideoGenerationMode } from "@/lib/video-reference-contract";

import type { CanvasNodeMetadata } from "../types";
import { canvasVideoGenerationModeLabel, canvasVideoGenerationModePatch, normalizeCanvasVideoGenerationMode } from "../utils/canvas-video-references";

const videoGenerationModeOptions: readonly { value: CanvasVideoGenerationMode; label: string }[] = canvasVideoGenerationModes.map((mode) => ({
    value: mode,
    label: canvasVideoGenerationModeLabel(mode),
}));

export function CanvasVideoModeSelector({ metadata, onChange }: { metadata?: CanvasNodeMetadata; onChange: (patch: Partial<CanvasNodeMetadata>) => void }) {
    const currentMode = normalizeCanvasVideoGenerationMode(metadata?.videoGenerationMode);
    return <CompactOptionGroup label="视频生成模式" ariaLabel="选择视频生成模式" value={currentMode} options={videoGenerationModeOptions} columns={5} onChange={(mode) => onChange(canvasVideoGenerationModePatch(mode))} />;
}
