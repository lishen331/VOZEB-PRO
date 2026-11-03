"use client";

import { Popover } from "antd";
import { BookOpen, Eraser, Languages, Wand2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { VzButton, VzIconButton } from "./primitives";

type Props = { value: string; onChange: (value: string) => void; maxLength?: number; suggestions?: string[]; disabled?: boolean; status?: "error"; hint?: string };
const LOCAL_TEMPLATES = [
    { name: "静谧建筑", zh: "海边的极简建筑，银灰色混凝土与温润木材，清晨薄雾，柔和自然光，建筑摄影", en: "Minimal coastal architecture, silver concrete and warm timber, soft morning mist, natural light, architectural photography." },
    { name: "胶片人像", zh: "窗边的人物肖像，暖色逆光，柔和肤质，85mm 镜头，浅景深，细腻胶片颗粒", en: "A portrait beside a window, warm backlighting, natural skin texture, 85mm lens, shallow depth of field, fine film grain." },
    { name: "奇境自然", zh: "银色山脉与青绿色湖泊，远处的雪峰，宁静旷野，电影级构图，细腻自然纹理", en: "Silver mountains and a turquoise lake, distant snowy peaks, a quiet wilderness, cinematic composition, intricate natural textures." },
];
const popupContainer = (trigger: HTMLElement) => trigger.closest<HTMLElement>(".vz-ds") ?? trigger.parentElement ?? trigger;

/** Local-only prompt assistance for the isolated visual preview; never calls a model. */
export function VzPromptEditor({ value, onChange, maxLength = 1000, suggestions = [], disabled, status, hint }: Props) {
    const id = useId();
    const timer = useRef<number | undefined>(undefined);
    const libraryTrigger = useRef<HTMLButtonElement>(null);
    const translationTrigger = useRef<HTMLButtonElement>(null);
    const [enhancing, setEnhancing] = useState(false);
    const [libraryOpen, setLibraryOpen] = useState(false);
    const [translationOpen, setTranslationOpen] = useState(false);
    const [feedback, setFeedback] = useState("本地演示 · 不调用 API，不扣费");
    const busy = disabled || enhancing;
    const translation = LOCAL_TEMPLATES.find((template) => template.zh === value)?.en ?? LOCAL_TEMPLATES[0].en;

    useEffect(() => () => window.clearTimeout(timer.current), []);

    const apply = (next: string, message: string) => {
        if (busy) return;
        onChange(next.slice(0, maxLength));
        setFeedback(message);
    };
    const enhance = () => {
        if (busy || !value.trim()) return;
        setEnhancing(true);
        setFeedback("正在预览本地润色效果…");
        // This delay only demonstrates the existing loading state; it is not a request/retry timer.
        timer.current = window.setTimeout(() => {
            onChange(`${value.trim()}，电影级布光，浅景深，细腻胶片颗粒，8K 细节`.slice(0, maxLength));
            setEnhancing(false);
            setFeedback("已追加本地风格示例 · 未调用 AI");
        }, 900);
    };
    const library = (
        <div
            className="vz-prompt-library"
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    setLibraryOpen(false);
                    libraryTrigger.current?.focus();
                }
            }}
        >
            <span className="vz-h3">提示词库</span>
            <span className="vz-caption">本地示例 · 选择后替换当前输入</span>
            {LOCAL_TEMPLATES.map((template) => (
                <button
                    key={template.name}
                    type="button"
                    className="vz-prompt-template"
                    data-prompt-template={template.name}
                    disabled={busy}
                    onClick={() => {
                        apply(template.zh, `已应用「${template.name}」本地模板`);
                        setLibraryOpen(false);
                        libraryTrigger.current?.focus();
                    }}
                >
                    <span className="vz-prompt-template__name">{template.name}</span>
                    <span className="vz-caption">{template.zh}</span>
                </button>
            ))}
        </div>
    );
    const englishPreview = (
        <div
            className="vz-prompt-library"
            onKeyDown={(event) => {
                if (event.key === "Escape") {
                    setTranslationOpen(false);
                    translationTrigger.current?.focus();
                }
            }}
        >
            <span className="vz-h3">英文示例预览</span>
            <span className="vz-caption">本地固定示例，不会自动翻译或覆盖你的输入。</span>
            <p className="vz-prompt-translation" lang="en">
                {translation}
            </p>
            <VzButton
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => {
                    apply(translation, "已使用本地英文示例 · 非实时翻译");
                    setTranslationOpen(false);
                    translationTrigger.current?.focus();
                }}
            >
                使用英文示例
            </VzButton>
        </div>
    );

    return (
        <div className="vz-prompt" data-status={status} aria-disabled={disabled || undefined}>
            <label htmlFor={id} className="vz-prompt__head">
                <span className="vz-h3">提示词</span>
                <span className="vz-caption vz-num" aria-hidden="true" data-over={value.length > maxLength * 0.9 || undefined}>{`${value.length} / ${maxLength}`}</span>
            </label>
            <textarea
                id={id}
                className="vz-prompt__area"
                rows={5}
                value={value}
                maxLength={maxLength}
                disabled={busy}
                placeholder="描述你想要的画面：主体、场景、风格、光线、镜头……"
                aria-invalid={status === "error" || undefined}
                aria-describedby={`${id}-feedback${hint ? ` ${id}-hint` : ""}`}
                onChange={(event) => onChange(event.target.value)}
            />
            {suggestions.length ? (
                <div className="vz-prompt__chips" aria-label="风格建议">
                    {suggestions.map((item) => (
                        <button key={item} type="button" className="vz-chip" disabled={busy} onClick={() => apply(value ? `${value}，${item}` : item, `已添加「${item}」风格`)}>{`+ ${item}`}</button>
                    ))}
                </div>
            ) : null}
            <div className="vz-prompt__bar">
                <VzButton size="sm" variant="secondary" icon={Wand2} loading={enhancing} disabled={busy || !value.trim()} onClick={enhance}>
                    {enhancing ? "润色中" : "AI 润色"}
                </VzButton>
                <Popover content={library} trigger="click" open={libraryOpen && !busy} onOpenChange={setLibraryOpen} getPopupContainer={popupContainer} placement="top" arrow={false}>
                    <VzIconButton ref={libraryTrigger} size="sm" icon={BookOpen} label="提示词库" disabled={busy} onClick={() => setLibraryOpen(true)} />
                </Popover>
                <Popover content={englishPreview} trigger="click" open={translationOpen && !busy} onOpenChange={setTranslationOpen} getPopupContainer={popupContainer} placement="top" arrow={false}>
                    <VzIconButton ref={translationTrigger} size="sm" icon={Languages} label="翻译为英文" disabled={busy} onClick={() => setTranslationOpen(true)} />
                </Popover>
                <VzIconButton size="sm" icon={Eraser} label="清空提示词" disabled={busy || !value} onClick={() => apply("", "已清空当前提示词")} />
            </div>
            <span id={`${id}-feedback`} className="vz-prompt__demo-note" role="status" aria-live="polite">
                {feedback}
            </span>
            {hint ? (
                <span id={`${id}-hint`} className="vz-prompt__hint" role={status === "error" ? "alert" : undefined}>
                    {hint}
                </span>
            ) : null}
        </div>
    );
}
