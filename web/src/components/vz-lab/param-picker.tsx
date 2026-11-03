"use client";

import { Segmented, Slider, Switch } from "antd";
import type { KeyboardEvent } from "react";

export type LabParams = { ratio: string; quality: string; count: number; strength: number; hd: boolean };

const RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16"];

export function LabParamPicker({ value, onChange, disabled }: { value: LabParams; onChange: (next: LabParams) => void; disabled?: boolean }) {
    const set = <K extends keyof LabParams>(key: K, next: LabParams[K]) => onChange({ ...value, [key]: next });
    const onRatioKey = (event: KeyboardEvent<HTMLDivElement>) => {
        const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
        if (!step) return;
        event.preventDefault();
        const next = RATIOS[(RATIOS.indexOf(value.ratio) + step + RATIOS.length) % RATIOS.length];
        set("ratio", next);
        event.currentTarget.querySelector<HTMLButtonElement>(`[data-ratio="${next}"]`)?.focus();
    };

    return (
        <div className="vzl-params">
            <div className="vzl-param">
                <span className="vzl-param__label" id="vzl-ratio-label">
                    画面比例
                </span>
                <div className="vzl-ratios" role="radiogroup" aria-labelledby="vzl-ratio-label" onKeyDown={onRatioKey}>
                    {RATIOS.map((ratio) => {
                        const [w, h] = ratio.split(":").map(Number);
                        const scale = 14 / Math.max(w, h);
                        const checked = value.ratio === ratio;
                        return (
                            <button key={ratio} type="button" role="radio" aria-checked={checked} tabIndex={checked ? 0 : -1} data-ratio={ratio} className="vzl-ratio" disabled={disabled} onClick={() => set("ratio", ratio)}>
                                <i aria-hidden style={{ width: Math.round(w * scale), height: Math.round(h * scale) }} />
                                <span className="vzl-num">{ratio}</span>
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="vzl-param">
                <span className="vzl-param__label">画质</span>
                <Segmented block disabled={disabled} value={value.quality} onChange={(next) => set("quality", String(next))} options={["标准", "高清", "超清 4K"]} />
            </div>
            <div className="vzl-param vzl-param--inline">
                <span className="vzl-param__label">生成数量</span>
                <Segmented disabled={disabled} value={value.count} onChange={(next) => set("count", Number(next))} options={[1, 2, 4]} />
            </div>
            <div className="vzl-param">
                <span className="vzl-param__label">
                    <span>参考强度</span>
                    <span className="vzl-caption vzl-num">{`${value.strength}%`}</span>
                </span>
                <Slider disabled={disabled} min={0} max={100} value={value.strength} onChange={(next) => set("strength", next)} tooltip={{ open: false }} aria-label="参考强度" />
            </div>
            <div className="vzl-param vzl-param--inline">
                <span className="vzl-param__label">
                    <span>细节增强</span>
                    <span className="vzl-caption">+2 积分</span>
                </span>
                <Switch disabled={disabled} checked={value.hd} onChange={(next) => set("hd", next)} aria-label="细节增强" />
            </div>
        </div>
    );
}
