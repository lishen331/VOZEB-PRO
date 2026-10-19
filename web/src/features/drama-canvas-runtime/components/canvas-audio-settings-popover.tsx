"use client";

import { Segmented, Select, Slider, Switch, Tooltip } from "antd";
import { CircleHelp, RotateCcw } from "lucide-react";

import { AudioSettingsPanel } from "@/components/audio-settings-panel";
import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { audioFormatLabel, audioSpeedLabel, audioVoiceLabel } from "@/lib/audio-generation";
import { audioModelFamily, audioModelFields, audioParamsSummary, normalizeAudioParams, type AudioParamField, type AudioParams } from "@/lib/audio-model-params";
import type { CanvasTheme } from "@/lib/canvas-theme";
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

function AudioModelParamsPanel({ model, params, onChange, theme }: { model: string; params: AudioParams | undefined; onChange: (params: AudioParams) => void; theme: CanvasTheme }) {
    const fields = audioModelFields(model);
    const values = normalizeAudioParams(model, params);
    const groups = [...new Set(fields.map((field) => field.group))];
    const update = (key: string, value: AudioParams[string]) => onChange({ ...values, [key]: value });
    const reset = () => onChange(normalizeAudioParams(model, {}));

    return (
        <ImageSettingsTheme theme={theme}>
            <div className="w-[340px] space-y-4" style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {groups.map((group, index) => (
                    <section key={group} className="space-y-2.5">
                        <div className="flex items-center justify-between text-xs font-medium" style={{ color: theme.node.muted }}>
                            <span>{group}</span>
                            {index === 0 ? (
                                <button type="button" className="inline-flex items-center gap-1 hover:opacity-75" onClick={reset}>
                                    <RotateCcw className="size-3" />
                                    一键重置
                                </button>
                            ) : null}
                        </div>
                        {fields
                            .filter((field) => field.group === group)
                            .map((field) => (
                                <AudioParamControl key={field.key} field={field} value={values[field.key]} theme={theme} onChange={(value) => update(field.key, value)} />
                            ))}
                    </section>
                ))}
            </div>
        </ImageSettingsTheme>
    );
}

function AudioParamControl({ field, value, theme, onChange }: { field: AudioParamField; value: AudioParams[string]; theme: CanvasTheme; onChange: (value: AudioParams[string]) => void }) {
    const label = (
        <span className="inline-flex shrink-0 items-center gap-1 text-sm">
            {field.label}
            {field.hint ? (
                <Tooltip title={field.hint}>
                    <CircleHelp className="size-3.5" style={{ color: theme.node.muted }} />
                </Tooltip>
            ) : null}
        </span>
    );
    if (field.type === "slider") {
        const decimals = field.step < 1 ? (field.step < 0.1 ? 2 : 1) : 0;
        return (
            <div className="grid grid-cols-[72px_minmax(0,1fr)_56px] items-center gap-3">
                {label}
                <Slider min={field.min} max={field.max} step={field.step} value={Number(value)} onChange={(next) => onChange(next)} tooltip={{ open: false }} />
                <span className="rounded-lg px-2 py-1 text-center text-xs tabular-nums" style={{ background: theme.node.fill }}>
                    {Number(value).toFixed(decimals)}
                </span>
            </div>
        );
    }
    if (field.type === "switch") {
        return (
            <div className="flex items-center justify-between">
                {label}
                <Switch size="small" checked={Boolean(value)} onChange={onChange} />
            </div>
        );
    }
    if (field.type === "text") {
        return (
            <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
                {label}
                <input
                    value={String(value)}
                    placeholder={field.placeholder}
                    maxLength={200}
                    className="h-8 rounded-lg border bg-transparent px-2.5 text-sm outline-none"
                    style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                    onChange={(event) => onChange(event.target.value)}
                    onMouseDown={(event) => event.stopPropagation()}
                />
            </div>
        );
    }
    if (field.type === "segmented") {
        return (
            <div className="space-y-1.5">
                {label}
                <Segmented block size="small" value={String(value)} options={field.options} onChange={(next) => onChange(String(next))} />
            </div>
        );
    }
    return (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-center gap-3">
            {label}
            <span className="block [&_.ant-select]:w-full">
                <Select value={String(value)} options={field.options} listHeight={220} showSearch optionFilterProp="label" styles={{ popup: { root: { zIndex: 1305 } } }} onChange={(next) => onChange(next)} />
            </span>
        </div>
    );
}
