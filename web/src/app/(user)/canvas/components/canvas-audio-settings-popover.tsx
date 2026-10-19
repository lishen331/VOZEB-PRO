"use client";

import { AudioModelParamsPanel, AudioSettingsPanel } from "@/components/audio-settings-panel";
import { audioFormatLabel, audioSpeedLabel, audioVoiceLabel } from "@/lib/audio-generation";
import { audioModelFamily, audioParamsSummary, type AudioParams } from "@/lib/audio-model-params";
import type { AiConfig } from "@/stores/use-config-store";
import { CanvasSettingsPopoverShell, type CanvasSettingsPopoverPlacement } from "./canvas-settings-popover-shell";

export type CanvasAudioSettingKey = "audioVoice" | "audioFormat" | "audioSpeed" | "audioInstructions";

type CanvasAudioSettingsPopoverProps = {
    config: AiConfig;
    onConfigChange: (key: CanvasAudioSettingKey, value: string) => void;
    onParamsChange?: (params: AudioParams) => void;
    buttonClassName?: string;
    placement?: CanvasSettingsPopoverPlacement;
};

export function CanvasAudioSettingsPopover({ config, onConfigChange, onParamsChange, buttonClassName, placement = "topLeft" }: CanvasAudioSettingsPopoverProps) {
    const family = audioModelFamily(config.model);
    const label = family === "openai" ? `${audioVoiceLabel(config.audioVoice)} · ${audioFormatLabel(config.audioFormat)} · ${audioSpeedLabel(config.audioSpeed)}` : audioParamsSummary(config.model, config.audioParams);
    return (
        <CanvasSettingsPopoverShell label={label} buttonClassName={buttonClassName} defaultButtonClassName="!h-8 !max-w-[170px] !justify-start !rounded-full !px-2.5" placement={placement}>
            {(theme) =>
                family === "openai" || !onParamsChange ? (
                    <AudioSettingsPanel config={config} onConfigChange={onConfigChange} theme={theme} className="space-y-4" />
                ) : (
                    <AudioModelParamsPanel model={config.model} params={config.audioParams} onChange={onParamsChange} theme={theme} />
                )
            }
        </CanvasSettingsPopoverShell>
    );
}
