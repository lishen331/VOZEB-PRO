"use client";

import { type ReactNode } from "react";
import { Segmented, Select, Slider, Switch, Tooltip } from "antd";
import { CircleHelp, RotateCcw } from "lucide-react";

import { audioModelFields, normalizeAudioParams, type AudioParamField, type AudioParams } from "@/lib/audio-model-params";

import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { audioFormatOptions, audioSpeedLabel, audioVoiceOptions, normalizeAudioFormatValue, normalizeAudioSpeedValue, normalizeAudioVoiceValue } from "@/lib/audio-generation";
import { type CanvasTheme } from "@/lib/canvas-theme";
import type { AiConfig } from "@/stores/use-config-store";

const speedOptions = ["0.75", "1", "1.25", "1.5"];

type AudioSettingKey = "audioVoice" | "audioFormat" | "audioSpeed" | "audioInstructions";

type AudioSettingsPanelProps = {
    config: AiConfig;
    onConfigChange: (key: AudioSettingKey, value: string) => void;
    theme: CanvasTheme;
    showTitle?: boolean;
    className?: string;
};

export function AudioSettingsPanel({ config, onConfigChange, theme, showTitle = true, className = "w-[320px] space-y-4 rounded-2xl px-1 py-0.5" }: AudioSettingsPanelProps) {
    const voice = normalizeAudioVoiceValue(config.audioVoice);
    const format = normalizeAudioFormatValue(config.audioFormat);
    const speed = normalizeAudioSpeedValue(config.audioSpeed);
    const speedSelectOptions = speedOptions.map((value) => ({ value, label: audioSpeedLabel(value) }));

    return (
        <ImageSettingsTheme theme={theme}>
            <div className={className} style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {showTitle ? <div className="text-lg font-semibold">音频设置</div> : null}
                <SettingGroup title="声音" color={theme.node.muted}>
                    <AudioSelect value={voice} options={audioVoiceOptions} theme={theme} onChange={(value) => onConfigChange("audioVoice", value)} />
                </SettingGroup>
                <div className="grid grid-cols-2 gap-2.5">
                    <SettingGroup title="格式" color={theme.node.muted}>
                        <AudioSelect value={format} options={audioFormatOptions} theme={theme} onChange={(value) => onConfigChange("audioFormat", value)} />
                    </SettingGroup>
                    <SettingGroup title="语速" color={theme.node.muted}>
                        <AudioSelect value={speed} options={speedSelectOptions} theme={theme} onChange={(value) => onConfigChange("audioSpeed", value)} />
                    </SettingGroup>
                </div>
                <SettingGroup title="声音指令" color={theme.node.muted}>
                    <textarea
                        value={config.audioInstructions || ""}
                        placeholder="例如：自然、温暖、适合旁白。"
                        className="thin-scrollbar h-16 w-full resize-none rounded-xl border bg-transparent px-3 py-2 text-sm leading-5 outline-none"
                        style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                        onChange={(event) => onConfigChange("audioInstructions", event.target.value)}
                        onMouseDown={(event) => event.stopPropagation()}
                    />
                </SettingGroup>
            </div>
        </ImageSettingsTheme>
    );
}

function AudioSelect({ value, options, theme, onChange }: { value: string; options: Array<{ value: string; label: string }>; theme: CanvasTheme; onChange: (value: string) => void }) {
    return (
        <span className="block [&_.ant-select]:w-full" onMouseDown={(event) => event.stopPropagation()}>
            {/* This panel is a hand-rolled portal (canvas-settings-popover-shell.tsx) at
                zIndex 1200, not an antd Modal/Popover, so antd's automatic zIndex-context
                bump never applies to this Select — its dropdown defaults to 1050 and
                renders underneath the panel body. Match canvas-camera-control.tsx's fix. */}
            <Select value={value} options={options} listHeight={176} styles={{ popup: { root: { zIndex: 1305 } } }} onChange={onChange} />
        </span>
    );
}

function SettingGroup({ title, color, children }: { title: string; color: string; children: ReactNode }) {
    return (
        <div className="space-y-2">
            <div className="text-xs font-medium" style={{ color }}>
                {title}
            </div>
            {children}
        </div>
    );
}

export function AudioModelParamsPanel({ model, params, onChange, theme }: { model: string; params: AudioParams | undefined; onChange: (params: AudioParams) => void; theme: CanvasTheme }) {
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
