"use client";

import { Eraser, Wand2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { LabButton, LabIconButton } from "./primitives";

type Props = { value: string; onChange: (value: string) => void; maxLength?: number; suggestions?: string[]; disabled?: boolean; error?: string };

/** Prompt editor. "AI 润色" here is a local string append for the preview; it never calls a model. */
export function LabPromptEditor({ value, onChange, maxLength = 1000, suggestions = [], disabled, error }: Props) {
    const id = useId();
    const [polishing, setPolishing] = useState(false);
    const timer = useRef<number | undefined>(undefined);
    const busy = disabled || polishing;

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const polish = () => {
        setPolishing(true);
        timer.current = window.setTimeout(() => {
            onChange(`${value.trim()}，电影级布光，浅景深，细腻胶片颗粒`.slice(0, maxLength));
            setPolishing(false);
        }, 900);
    };

    return (
        <div className="vzl-prompt" data-status={error ? "error" : undefined}>
            <label htmlFor={id} className="vzl-prompt__head">
                <span className="vzl-h3">提示词</span>
                <span className="vzl-caption vzl-num" data-over={value.length > maxLength * 0.9 || undefined}>{`${value.length} / ${maxLength}`}</span>
            </label>
            <textarea
                id={id}
                rows={5}
                value={value}
                maxLength={maxLength}
                disabled={busy}
                placeholder="描述你想要的画面：主体、场景、风格、光线、镜头……"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-err` : undefined}
                onChange={(event) => onChange(event.target.value)}
            />
            {suggestions.length ? (
                <div className="vzl-chips" role="group" aria-label="风格建议">
                    {suggestions.map((item) => (
                        <button key={item} type="button" className="vzl-chip" disabled={busy} onClick={() => onChange((value ? `${value}，${item}` : item).slice(0, maxLength))}>
                            {`+ ${item}`}
                        </button>
                    ))}
                </div>
            ) : null}
            <div className="vzl-prompt__bar">
                <LabButton size="sm" icon={Wand2} loading={polishing} disabled={busy || !value.trim()} onClick={polish}>
                    {polishing ? "润色中" : "AI 润色"}
                </LabButton>
                <LabIconButton size="sm" icon={Eraser} label="清空提示词" disabled={busy || !value} onClick={() => onChange("")} />
                <span className="vzl-caption" style={{ marginLeft: "auto" }}>
                    ⌘ + Enter 快速生成
                </span>
            </div>
            {error ? (
                <span id={`${id}-err`} className="vzl-prompt__hint" role="alert">
                    {error}
                </span>
            ) : null}
        </div>
    );
}
