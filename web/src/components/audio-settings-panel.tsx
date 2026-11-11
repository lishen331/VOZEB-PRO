"use client";

import { type ReactNode, useMemo } from "react";
import { Checkbox, Segmented, Select, Slider, Switch, Tooltip } from "antd";
import { CircleHelp, RotateCcw } from "lucide-react";
import useSWR from "swr";

import { audioModelFamily, audioVisibleFields, normalizeAudioParams, type AudioParamField, type AudioParamOption, type AudioParams } from "@/lib/audio-model-params";

import { AudioDialogRoles, type DialogRoleSetting } from "@/components/audio-dialog-roles";
import { CompactOptionGroup } from "@/components/creative-generation-preferences";
import { ImageSettingsTheme } from "@/components/image-settings-panel";
import { VoiceSelector } from "@/components/voice-selector";
import { VoicePreviewButton, useVoicePreview } from "@/components/voice-preview";
import { audioFormatOptions, audioSpeedLabel, audioVoiceOptions, normalizeAudioFormatValue, normalizeAudioSpeedValue, normalizeAudioVoiceValue } from "@/lib/audio-generation";
import type { AudioMode } from "@/lib/audio-node-mode";
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
                    <AudioSelect value={voice} options={audioVoiceOptions} onChange={(value) => onConfigChange("audioVoice", value)} />
                </SettingGroup>
                <div className="grid grid-cols-2 gap-2.5">
                    <SettingGroup title="格式" color={theme.node.muted}>
                        <AudioSelect value={format} options={audioFormatOptions} onChange={(value) => onConfigChange("audioFormat", value)} />
                    </SettingGroup>
                    <SettingGroup title="语速" color={theme.node.muted}>
                        <AudioSelect value={speed} options={speedSelectOptions} onChange={(value) => onConfigChange("audioSpeed", value)} />
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

function AudioSelect({ value, options, onChange }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
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

export type AudioModePanelState = {
    mode: AudioMode;
    voiceDescription?: string;
    cloneConsent?: boolean;
    dialogRoles?: Record<string, DialogRoleSetting>;
};

type AudioModelParamsPanelProps = {
    model: string;
    params: AudioParams | undefined;
    onChange: (params: AudioParams) => void;
    theme: CanvasTheme;
    /** 只有千问和 MiniMax 支持设计、克隆、多人对话；没有这两个回调时完全不显示模式控件。 */
    modeState?: AudioModePanelState;
    onModeStateChange?: (patch: Partial<AudioModePanelState>) => void;
    /** 多人对话按「名字：台词」解析角色，这里传节点输入框的文本。 */
    dialogText?: string;
    /** 克隆模式的参考音频卡片。 */
    referenceAudio?: { label: string; durationMs?: number } | null;
};

const AUDIO_MODE_OPTIONS = [
    { value: "tts" as const, label: "合成" },
    { value: "design" as const, label: "设计" },
    { value: "clone" as const, label: "克隆" },
    { value: "dialog" as const, label: "多人对话" },
];

export function AudioModelParamsPanel({ model, params, onChange, theme, modeState, onModeStateChange, dialogText = "", referenceAudio }: AudioModelParamsPanelProps) {
    const family = audioModelFamily(model);
    const modeCapable = (family === "qwen" || family === "minimax") && Boolean(modeState && onModeStateChange);
    const mode = modeCapable ? (modeState as AudioModePanelState).mode : "tts";
    const allFields = audioVisibleFields(model, params);
    // 设计、克隆不选音色；多人对话的音色在角色卡片里选，全局指令也由角色指令代替。
    const fields = !modeCapable ? allFields : allFields.filter((field) => (field.key === "voiceId" ? mode === "tts" : field.key === "instruction" ? mode !== "dialog" : true));
    const values = normalizeAudioParams(model, params);
    const groups = [...new Set(fields.map((field) => field.group))];
    const update = (key: string, value: AudioParams[string]) => onChange({ ...values, [key]: value });
    const reset = () => onChange(normalizeAudioParams(model, {}));
    const voiceField = allFields.find((field): field is AudioParamField & { options: AudioParamOption[] } => field.key === "voiceId" && field.type === "select");

    return (
        <ImageSettingsTheme theme={theme}>
            <div className="w-full min-w-0 space-y-4" style={{ color: theme.node.text }} onMouseDown={(event) => event.stopPropagation()}>
                {modeCapable ? (
                    <>
                        <CompactOptionGroup label="生成模式" ariaLabel="选择音频生成模式" value={mode} options={AUDIO_MODE_OPTIONS} columns={4} onChange={(next) => onModeStateChange?.({ mode: next })} />
                        {mode === "design" ? <VoiceDescriptionField value={modeState?.voiceDescription || ""} theme={theme} onChange={(voiceDescription) => onModeStateChange?.({ voiceDescription })} /> : null}
                        {mode === "clone" ? <ClonePanel referenceAudio={referenceAudio} consent={Boolean(modeState?.cloneConsent)} theme={theme} onConsentChange={(cloneConsent) => onModeStateChange?.({ cloneConsent })} /> : null}
                        {mode === "dialog" && voiceField && (family === "qwen" || family === "minimax") ? (
                            <section className="space-y-2">
                                <div className="text-xs font-medium" style={{ color: theme.node.muted }}>
                                    角色
                                </div>
                                <AudioDialogRoles text={dialogText} roles={modeState?.dialogRoles || {}} model={model} family={family} presetVoices={voiceField.options} theme={theme} onChange={(dialogRoles) => onModeStateChange?.({ dialogRoles })} />
                            </section>
                        ) : null}
                    </>
                ) : null}
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
                                <AudioParamControl key={field.key} field={field} model={model} hideLabel={field.label === group} value={values[field.key]} theme={theme} onChange={(value) => update(field.key, value)} />
                            ))}
                    </section>
                ))}
            </div>
        </ImageSettingsTheme>
    );
}

function VoiceDescriptionField({ value, theme, onChange }: { value: string; theme: CanvasTheme; onChange: (value: string) => void }) {
    return (
        <section className="space-y-1.5">
            <div className="text-xs font-medium" style={{ color: theme.node.muted }}>
                声音描述
            </div>
            <textarea
                value={value}
                maxLength={500}
                placeholder="例如：三十多岁的女性，声音温柔偏低沉，语速从容，适合纪录片旁白。"
                className="thin-scrollbar h-20 w-full resize-none rounded-xl border bg-transparent px-3 py-2 text-sm leading-5 outline-none"
                style={{ borderColor: theme.node.stroke, color: theme.node.text }}
                onChange={(event) => onChange(event.target.value)}
                onMouseDown={(event) => event.stopPropagation()}
            />
            <div className="text-right text-[11px]" style={{ color: theme.node.muted }}>
                {value.trim().length} / 500
            </div>
        </section>
    );
}

function ClonePanel({ referenceAudio, consent, theme, onConsentChange }: { referenceAudio?: { label: string; durationMs?: number } | null; consent: boolean; theme: CanvasTheme; onConsentChange: (consent: boolean) => void }) {
    return (
        <section className="space-y-2">
            <div className="text-xs font-medium" style={{ color: theme.node.muted }}>
                参考音频
            </div>
            <div className="rounded-xl border px-3 py-2 text-xs leading-5" style={{ borderColor: theme.node.stroke, color: theme.node.text }}>
                {referenceAudio ? (
                    <>
                        <div className="truncate">{referenceAudio.label}</div>
                        <div style={{ color: theme.node.muted }}>{referenceAudio.durationMs ? `${Math.round(referenceAudio.durationMs / 1000)} 秒 · ` : ""}用它的声音读输入框里的文本</div>
                    </>
                ) : (
                    <span style={{ color: theme.node.muted }}>把一个音频节点连到本节点，作为要克隆的声音</span>
                )}
            </div>
            <Checkbox checked={consent} onChange={(event) => onConsentChange(event.target.checked)}>
                <span className="text-xs">我已获得该声音本人授权，同意用于语音合成</span>
            </Checkbox>
        </section>
    );
}

function AudioParamControl({ field, model, hideLabel, value, theme, onChange }: { field: AudioParamField; model: string; hideLabel?: boolean; value: AudioParams[string]; theme: CanvasTheme; onChange: (value: AudioParams[string]) => void }) {
    const label = (
        <span className="inline-flex shrink-0 items-center gap-1 text-sm">
            {field.label}
            {field.hint ? (
                <Tooltip title={field.hint} zIndex={1305}>
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
                {hideLabel ? null : label}
                <Segmented block size="small" value={String(value)} options={field.options} onChange={(next) => onChange(String(next))} />
            </div>
        );
    }
    if (field.key === "voiceId") return <VoiceParamControl field={field} model={model} value={String(value)} theme={theme} onChange={onChange} />;
    return <AudioParamSelect label={label} options={field.options} value={String(value)} theme={theme} onChange={onChange} />;
}

/**
 * 音色字段专用：「当前模型是否配置了自定义音色」由能力接口决定，
 * 未启用时完全退回原来的下拉框，画布其它行为和改动前一致。
 */
function VoiceParamControl({ field, model, value, theme, onChange }: { field: AudioParamField & { options: SelectOption[] }; model: string; value: string; theme: CanvasTheme; onChange: (value: AudioParams[string]) => void }) {
    const { data, isLoading } = useSWR<{ enabled: boolean }>(`/api/custom-voices/capabilities?ttsModel=${encodeURIComponent(model)}`, (url) => fetch(url).then((res) => res.json()), { revalidateOnFocus: false });
    const label = (
        <span className="inline-flex shrink-0 items-center gap-1 text-sm">
            {field.label}
            {field.hint ? (
                <Tooltip title={field.hint} zIndex={1305}>
                    <CircleHelp className="size-3.5" style={{ color: theme.node.muted }} />
                </Tooltip>
            ) : null}
        </span>
    );
    if (isLoading || !data?.enabled) {
        return <AudioParamSelect label={label} options={field.options} value={value} theme={theme} onChange={onChange} />;
    }
    return (
        <div className="space-y-1.5">
            {label}
            <VoiceSelector value={value} presetVoices={field.options} model={model} theme={theme} onChange={(next) => onChange(next)} />
        </div>
    );
}

type SelectOption = AudioParamOption;

function AudioParamSelect({ label, options, value, theme, onChange }: { label: ReactNode; options: SelectOption[]; value: string; theme: CanvasTheme; onChange: (value: string) => void }) {
    const preview = useVoicePreview();
    const grouped = useMemo(() => groupSelectOptions(options), [options]);
    const hasPreview = options.some((option) => option.preview);
    const currentPreview = options.find((option) => option.value === value)?.preview;
    return (
        <div className={`grid ${hasPreview ? "grid-cols-[72px_minmax(0,1fr)_24px]" : "grid-cols-[72px_minmax(0,1fr)]"} items-center gap-3`}>
            {label}
            <span className="block min-w-0 [&_.ant-select]:w-full">
                <Select<string, SelectEntry>
                    value={value}
                    options={grouped}
                    listHeight={hasPreview ? 280 : 220}
                    showSearch={{ optionFilterProp: hasPreview ? "search" : "label" }}
                    styles={{ popup: { root: { zIndex: 1305 } } }}
                    optionRender={
                        hasPreview
                            ? (option) => (
                                  <span className="flex items-center justify-between gap-2">
                                      <span className="min-w-0 truncate">{option.label}</span>
                                      {"preview" in option.data && option.data.preview ? <VoicePreviewButton url={option.data.preview} preview={preview} theme={theme} /> : null}
                                  </span>
                              )
                            : undefined
                    }
                    onChange={(next) => onChange(next)}
                />
            </span>
            {hasPreview ? currentPreview ? <VoicePreviewButton url={currentPreview} preview={preview} theme={theme} /> : <span /> : null}
        </div>
    );
}

type SelectEntry = SelectOption | { label: string; title: string; options: SelectOption[] };

function groupSelectOptions(options: SelectOption[]): SelectEntry[] {
    if (!options.some((option) => option.group)) return options;
    const groups = new Map<string, SelectOption[]>();
    for (const option of options) {
        const name = option.group || "其他";
        groups.set(name, [...(groups.get(name) || []), option]);
    }
    return [...groups].map(([name, items]) => ({ label: name, title: name, options: items }));
}
