"use client";

import { AudioModelParamsPanel, AudioSettingsPanel } from "@/components/audio-settings-panel";
import { audioModelFamily, audioParamsSummary, type AudioParams } from "@/lib/audio-model-params";
import { audioFormatLabel, audioSpeedLabel, audioVoiceLabel } from "@/lib/audio-generation";
import { resolveAudioMode } from "@/lib/audio-node-mode";
import type { AiConfig } from "@/stores/use-config-store";
import type { CanvasNodeMetadata } from "../types";
import type { CanvasResourceReference } from "../utils/canvas-resource-references";
import { CanvasSettingsPopoverShell, type CanvasSettingsPopoverPlacement } from "./canvas-settings-popover-shell";

export type CanvasAudioSettingKey = "audioVoice" | "audioFormat" | "audioSpeed" | "audioInstructions";

type CanvasAudioSettingsPopoverProps = {
    config: AiConfig;
    metadata?: CanvasNodeMetadata;
    references?: CanvasResourceReference[];
    /** 当前节点 id：引用清单在没有输入时会把节点自己列进来，必须排除，否则空节点也会显示克隆。 */
    nodeId?: string;
    dialogText?: string;
    onConfigChange: (key: CanvasAudioSettingKey, value: string) => void;
    onParamsChange?: (params: AudioParams) => void;
    onMetadataChange?: (patch: Partial<CanvasNodeMetadata>) => void;
    buttonClassName?: string;
    placement?: CanvasSettingsPopoverPlacement;
};

const MODE_LABELS = { tts: "合成", design: "设计", clone: "克隆", dialog: "多人对话" } as const;

export function CanvasAudioSettingsPopover({ config, metadata, references = [], nodeId, dialogText = "", onConfigChange, onParamsChange, onMetadataChange, buttonClassName, placement = "topLeft" }: CanvasAudioSettingsPopoverProps) {
    const family = audioModelFamily(config.model);
    // 只有千问和 MiniMax 有设计 / 克隆 / 多人对话；Suno、OpenAI 永远按普通合成显示和提交。
    const modeCapable = (family === "qwen" || family === "minimax") && Boolean(onMetadataChange);
    const referenceAudios = references.filter((reference) => reference.kind === "audio" && reference.active && reference.nodeId && reference.nodeId !== nodeId);
    const referenceAudio = referenceAudios[0];
    const audioMode = resolveAudioMode(metadata || {}, referenceAudios.length > 0);
    const modeSummary = !modeCapable
        ? ""
        : audioMode === "clone"
          ? `${MODE_LABELS.clone} · ${referenceAudio?.label || "未连接音频"}`
          : audioMode === "dialog"
            ? `${MODE_LABELS.dialog} · ${(dialogText.match(/^\s*([^\s：:]{1,8})\s*[：:]/gm) || []).length ? "按台词合成" : "等待台词"}`
            : audioMode === "design"
              ? `${MODE_LABELS.design} · ${metadata?.audioVoiceDescription?.trim() ? metadata.audioVoiceDescription.trim().slice(0, 8) : "未填写描述"}`
              : "";
    const detail = family === "openai" ? `${audioVoiceLabel(config.audioVoice)} · ${audioFormatLabel(config.audioFormat)} · ${audioSpeedLabel(config.audioSpeed)}` : audioParamsSummary(config.model, config.audioParams);
    const label = modeSummary ? `${modeSummary} · ${detail}` : detail;

    return (
        <CanvasSettingsPopoverShell label={label} buttonClassName={buttonClassName} defaultButtonClassName="!h-8 !max-w-[170px] !justify-start !rounded-full !px-2.5" placement={placement}>
            {(theme) =>
                family === "openai" || !onParamsChange ? (
                    <AudioSettingsPanel config={config} onConfigChange={onConfigChange} theme={theme} className="space-y-4" />
                ) : (
                    <AudioModelParamsPanel
                        model={config.model}
                        params={config.audioParams}
                        onChange={onParamsChange}
                        theme={theme}
                        modeState={modeCapable ? { mode: audioMode, voiceDescription: metadata?.audioVoiceDescription, cloneConsent: metadata?.audioCloneConsent, dialogRoles: metadata?.audioDialogRoles } : undefined}
                        onModeStateChange={
                            modeCapable
                                ? (patch) => {
                                      const next: Partial<CanvasNodeMetadata> = {};
                                      // 手动选过模式后不再根据连线、断开或文本自动切换。
                                      if (patch.mode && patch.mode !== audioMode) {
                                          next.audioMode = patch.mode;
                                          next.audioModeManual = true;
                                      }
                                      if (patch.voiceDescription !== undefined) next.audioVoiceDescription = patch.voiceDescription;
                                      if (patch.cloneConsent !== undefined) next.audioCloneConsent = patch.cloneConsent;
                                      if (patch.dialogRoles !== undefined) next.audioDialogRoles = patch.dialogRoles;
                                      if (Object.keys(next).length) onMetadataChange?.(next);
                                  }
                                : undefined
                        }
                        dialogText={dialogText}
                        referenceAudio={referenceAudio ? { label: referenceAudio.label, durationMs: referenceAudio.durationMs } : null}
                    />
                )
            }
        </CanvasSettingsPopoverShell>
    );
}
