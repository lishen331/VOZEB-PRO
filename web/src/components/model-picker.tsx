"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Cpu } from "lucide-react";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/stores/use-config-store";
import { audioModelPurpose, type AudioModelPurpose } from "@/lib/audio-model-params";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
    /** 传入后不再读取用户配置的模型列表，练习画布用它展示虚拟名或练习池模型。 */
    optionsOverride?: string[];
    disabled?: boolean;
};

export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, placeholder = "选择模型", onMissingConfig, optionsOverride, disabled = false }: ModelPickerProps) {
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const configuredOptions = useMemo(() => (optionsOverride ? optionsOverride.filter(Boolean) : selectableModelsByCapability(config, capability)), [capability, config, optionsOverride]);
    const current = !capability || !value || configuredOptions.includes(value) ? value || "" : "";
    const options = useMemo(() => {
        const currentOption = !capability || !value || configuredOptions.includes(value) ? value : "";
        return Array.from(new Set([currentOption, ...configuredOptions].filter((model): model is string => Boolean(model))));
    }, [capability, configuredOptions, value]);
    const hasConfiguredOptions = configuredOptions.length > 0;

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    return (
        <Select
            open={open}
            value={current}
            onOpenChange={(nextOpen) => {
                if (disabled) {
                    setOpen(false);
                    return;
                }
                if (nextOpen && !hasConfiguredOptions) {
                    setOpen(false);
                    onMissingConfig?.();
                    return;
                }
                if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                setOpen(nextOpen);
            }}
            onValueChange={onChange}
        >
            <SelectTrigger
                className={cn(
                    "canvas-composer-model-picker h-8 w-fit max-w-full gap-2 rounded-full border border-input bg-transparent px-3 text-sm font-normal shadow-sm transition-colors",
                    fullWidth ? "w-full min-w-0 justify-start" : "min-w-[9rem] justify-start",
                    "data-[state=open]:border-ring data-[state=open]:ring-2 data-[state=open]:ring-ring/20",
                    className,
                )}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                title={current ? modelOptionLabel(config, current) : placeholder}
                disabled={disabled}
            >
                <ModelIcon model={current} />
                <span className="canvas-model-picker-text min-w-0 flex-1 truncate text-left">{current ? (optionsOverride ? current : modelOptionLabel(config, current)) : placeholder}</span>
            </SelectTrigger>
            <SelectContent
                data-canvas-no-zoom
                className="z-[1200] max-h-[min(18rem,calc(100vh-96px))] w-[min(20rem,var(--radix-select-content-available-width))] min-w-[var(--radix-select-trigger-width)] max-w-[calc(100vw-32px)] rounded-xl border border-border/70 bg-popover p-1 shadow-xl"
                position="popper"
                align="start"
                side="bottom"
                sideOffset={6}
                onPointerDown={(event) => event.stopPropagation()}
                onMouseDown={(event) => event.stopPropagation()}
            >
                {options.length ? (
                    capability === "audio" && !optionsOverride ? (
                        audioOptionOrder(options).map((model) => (
                            <SelectItem key={model} value={model} textValue={modelOptionLabel(config, model)}>
                                <ModelLabel config={config} model={model} purpose />
                            </SelectItem>
                        ))
                    ) : (
                        options.map((model) => (
                            <SelectItem key={model} value={model} textValue={optionsOverride ? model : modelOptionLabel(config, model)}>
                                {optionsOverride ? <span className="truncate">{model}</span> : <ModelLabel config={config} model={model} />}
                            </SelectItem>
                        ))
                    )
                ) : (
                    <SelectItem value="__empty__" disabled>
                        {emptyModelLabel(config, capability)}
                    </SelectItem>
                )}
            </SelectContent>
        </Select>
    );
}

/**
 * 音频模型按用途排序：配音（千问 / MiniMax）在前，音乐（Suno）在后。
 * 下拉项只接受 SelectItem，分组标题放不进去，所以每条自带用途标签。
 */
function audioOptionOrder(options: string[]) {
    const rank: Record<AudioModelPurpose, number> = { voice: 0, music: 1, other: 2 };
    return [...options].sort((left, right) => rank[audioModelPurpose(left)] - rank[audioModelPurpose(right)]);
}

function emptyModelLabel(config: AiConfig, capability?: ModelCapability) {
    const label = capability === "image" ? "生图" : capability === "video" ? "视频" : capability === "text" ? "文本" : capability === "audio" ? "音频" : "";
    if (capability && config.models.length) return `暂无匹配的${label}模型`;
    return config.models.length ? `暂无匹配的${label}模型` : "请联系管理员在后台配置渠道和模型";
}

function ModelLabel({ config, model, purpose = false }: { config: AiConfig; model: string; purpose?: boolean }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <ModelIcon model={model} />
            <span className="truncate">{modelOptionLabel(config, model)}</span>
            {purpose ? <AudioPurposeTag purpose={audioModelPurpose(model)} /> : null}
        </span>
    );
}

/** 音频模型用途标签：配音 / 音乐，帮用户区分「读文字」和「生音乐」。 */
function AudioPurposeTag({ purpose }: { purpose: AudioModelPurpose }) {
    const label = purpose === "music" ? "音乐" : purpose === "voice" ? "配音" : "其他";
    return (
        <span
            className={cn(
                "ml-auto shrink-0 rounded px-1 py-0.5 text-[10px] leading-none",
                purpose === "music" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : purpose === "voice" ? "bg-sky-500/15 text-sky-600 dark:text-sky-400" : "bg-muted text-muted-foreground",
            )}
        >
            {label}
        </span>
    );
}

export function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(modelOptionName(model));
    return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/icons/openai.svg";
    if (name.includes("grok")) return "/icons/grok.svg";
    if (name.includes("deepseek")) return "/icons/deepseek.svg";
    if (name.includes("glm")) return "/icons/glm.svg";
    return "";
}
