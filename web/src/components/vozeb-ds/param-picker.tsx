"use client";

import { Segmented, Slider, Switch } from "antd";
import { useId } from "react";

export type VzParams = { ratio: string; quality: string; count: number; strength: number; hd: boolean };

const RATIOS = ["1:1", "4:3", "3:4", "16:9", "9:16"];

function RatioIcon({ ratio }: { ratio: string }) {
    const [w, h] = ratio.split(":").map(Number);
    const scale = 14 / Math.max(w, h);
    return <i aria-hidden className="vz-ratio-icon" style={{ width: w * scale, height: h * scale }} />;
}

export function VzParamPicker({ value, onChange, disabled }: { value: VzParams; onChange: (next: VzParams) => void; disabled?: boolean }) {
    const groupName = useId();
    const set = <K extends keyof VzParams>(key: K, next: VzParams[K]) => onChange({ ...value, [key]: next });
    return (
        <div className="vz-params">
            <div className="vz-param">
                <span className="vz-param__label">画面比例</span>
                <div className="vz-ratio-group" role="radiogroup" aria-label="画面比例">
                    {RATIOS.map((ratio) => (
                        <label key={ratio} className="vz-ratio" data-selected={value.ratio === ratio || undefined} data-disabled={disabled || undefined}>
                            <input type="radio" name={groupName} value={ratio} checked={value.ratio === ratio} disabled={disabled} onChange={() => set("ratio", ratio)} />
                            <RatioIcon ratio={ratio} />
                            <span className="vz-num">{ratio}</span>
                        </label>
                    ))}
                </div>
            </div>
            <div className="vz-param">
                <span className="vz-param__label">画质</span>
                <Segmented block disabled={disabled} value={value.quality} onChange={(next) => set("quality", String(next))} options={["标准", "高清", "超清 4K"]} />
            </div>
            <div className="vz-param vz-param--inline">
                <span className="vz-param__label">生成数量</span>
                <Segmented disabled={disabled} value={value.count} onChange={(next) => set("count", Number(next))} options={[1, 2, 4]} />
            </div>
            <div className="vz-param">
                <span className="vz-param__label">
                    <span>参考强度</span>
                    <span className="vz-caption vz-num">{`${value.strength}%`}</span>
                </span>
                <Slider disabled={disabled} min={0} max={100} value={value.strength} onChange={(next) => set("strength", next)} tooltip={{ open: false }} aria-label="参考强度" />
            </div>
            <div className="vz-param vz-param--inline">
                <span className="vz-param__label">
                    <span>细节增强</span>
                    <span className="vz-caption">+2 积分</span>
                </span>
                <Switch disabled={disabled} checked={value.hd} onChange={(next) => set("hd", next)} aria-label="细节增强" />
            </div>
        </div>
    );
}
