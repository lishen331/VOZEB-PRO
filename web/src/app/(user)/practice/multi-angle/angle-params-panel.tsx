"use client";

import type { CSSProperties } from "react";
import { ArrowUp, RotateCcw } from "lucide-react";

import { cn } from "@/lib/utils";

import { BATCH_ANGLES, MAX_SHOT_DISTANCE, MIN_SHOT_DISTANCE, MODE_COPY, PRESET_TABS, shotLabel, type AngleMode, type BatchSize, type PresetKey } from "./lib/angle-model";
import s from "./multi-angle.module.css";

interface AngleParamsPanelProps {
    mode: AngleMode;
    h: number;
    p: number;
    d: number;
    fisheye: boolean;
    preset: PresetKey;
    batch: BatchSize;
    promptOn: boolean;
    prompt: string;
    ready: boolean;
    uploading: boolean;
    costLabel: string;
    generating: boolean;
    onModeChange: (mode: AngleMode) => void;
    onPresetChange: (preset: PresetKey) => void;
    onAngleChange: (next: { h?: number; p?: number; d?: number }) => void;
    onBatchChange: (batch: BatchSize) => void;
    onPromptToggle: () => void;
    onPromptChange: (value: string) => void;
    onReset: () => void;
    onGenerate: () => void;
}

const BATCH_OPTIONS: Array<{ value: BatchSize; label: string; hint: string }> = [
    { value: 1, label: "1 张", hint: "当前机位" },
    { value: 4, label: "4 张", hint: `环拍 · ${BATCH_ANGLES[4].length} 个机位` },
    { value: 6, label: "6 张", hint: "全角度" },
];

function fillPercent(value: number, min: number, max: number) {
    return `${((value - min) / (max - min)) * 100}%`;
}

/** 三根滑杆共用的控件；--ma-fill 驱动已走过的轨道颜色。 */
function SliderRow({ label, value, min, max, step, display, onChange }: { label: string; value: number; min: number; max: number; step: number; display: string; onChange: (value: number) => void }) {
    return (
        <div className={s.sliderRow}>
            <label>{label}</label>
            <input type="range" min={min} max={max} step={step} value={value} aria-label={label} style={{ "--ma-fill": fillPercent(value, min, max) } as CSSProperties} onChange={(event) => onChange(Number(event.target.value))} />
            <output>{display}</output>
        </div>
    );
}

export default function AngleParamsPanel({
    mode,
    h,
    p,
    d,
    fisheye,
    preset,
    batch,
    promptOn,
    prompt,
    ready,
    uploading,
    costLabel,
    generating,
    onModeChange,
    onPresetChange,
    onAngleChange,
    onBatchChange,
    onPromptToggle,
    onPromptChange,
    onReset,
    onGenerate,
}: AngleParamsPanelProps) {
    const copy = MODE_COPY[mode];
    const cameraMode = mode === "camera";

    return (
        <div className={s.panel}>
            <div className={s.modeSeg} role="tablist" aria-label="旋转对象">
                {(["camera", "subject"] as AngleMode[]).map((item) => (
                    <button key={item} type="button" role="tab" aria-selected={mode === item} className={cn(mode === item && s.modeSegActive)} onClick={() => onModeChange(item)}>
                        {item === "camera" ? "摄像头" : "主体"}
                    </button>
                ))}
            </div>

            <div>
                <h3>预设视角</h3>
                <div className={s.presetTabs}>
                    {PRESET_TABS.map((tab) => (
                        <button key={tab.key} type="button" className={cn(s.ptab, preset === tab.key && s.ptabActive)} onClick={() => onPresetChange(tab.key)}>
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className={s.sliders}>
                <SliderRow label={copy.hLabel} value={h} min={cameraMode ? 0 : -180} max={cameraMode ? 360 : 180} step={1} display={`${h}°`} onChange={(value) => onAngleChange({ h: value })} />
                <SliderRow label={copy.pLabel} value={p} min={-90} max={90} step={1} display={`${p}°`} onChange={(value) => onAngleChange({ p: value })} />
                <SliderRow label={copy.dLabel} value={d} min={MIN_SHOT_DISTANCE} max={MAX_SHOT_DISTANCE} step={0.5} display={fisheye ? "特写" : shotLabel(d)} onChange={(value) => onAngleChange({ d: value })} />
            </div>

            <div className={s.toggleRow}>
                <span>提示词</span>
                <button type="button" role="switch" aria-checked={promptOn} aria-label="提示词开关" className={cn(s.promptToggle, promptOn && s.promptToggleOn)} onClick={onPromptToggle} />
            </div>
            {promptOn ? (
                <div className={s.promptBox}>
                    <textarea aria-label="提示词" value={prompt} placeholder="可选：补充主体描述，例如「一位穿蓝色西装的男性，摄影棚光」" onChange={(event) => onPromptChange(event.target.value)} />
                </div>
            ) : null}

            <div>
                <h3 style={{ marginBottom: 10 }}>生成数量</h3>
                <div className={s.batchRow}>
                    {BATCH_OPTIONS.map((option) => (
                        <button key={option.value} type="button" aria-pressed={batch === option.value} className={cn(s.batch, batch === option.value && s.batchActive)} onClick={() => onBatchChange(option.value)}>
                            {option.label}
                            <small>{option.hint}</small>
                        </button>
                    ))}
                </div>
            </div>

            <div className={s.panelActions}>
                <button type="button" className={s.resetParams} onClick={onReset}>
                    <RotateCcw size={13} />
                    重置参数
                </button>
                <span className={s.spacer} />
                <span className={s.cost}>{costLabel}</span>
                <button type="button" className={s.sendBtn} aria-label="生成多角度画面" disabled={!ready || uploading || generating} onClick={onGenerate}>
                    <ArrowUp size={17} strokeWidth={2.2} />
                </button>
            </div>
        </div>
    );
}
