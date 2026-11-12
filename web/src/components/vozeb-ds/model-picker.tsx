"use client";

import { Popover } from "antd";
import { Check, ChevronDown, Zap } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useId, useRef, useState } from "react";

import { VzTag } from "./primitives";

export type VzModelOption = { id: string; name: string; vendor: string; desc: string; cost: number; badges?: string[]; speed?: "fast" | "standard" | "slow"; disabled?: boolean; disabledReason?: string };

type Props = { models: VzModelOption[]; value: string; onChange: (id: string) => void; getContainer?: () => HTMLElement; disabled?: boolean };

export function VzModelPicker({ models, value, onChange, getContainer, disabled }: Props) {
    const listId = useId();
    const trigger = useRef<HTMLButtonElement>(null);
    const options = useRef(new Map<string, HTMLButtonElement>());
    const [open, setOpen] = useState(false);
    const [activeId, setActiveId] = useState(value);
    const current = models.find((model) => model.id === value) ?? models[0];
    const enabled = models.filter((model) => !model.disabled);
    const unavailable = disabled || !enabled.length;

    const focusOption = (id: string) => {
        setActiveId(id);
        options.current.get(id)?.focus();
    };
    const close = () => {
        setOpen(false);
        trigger.current?.focus();
    };
    const select = (model: VzModelOption) => {
        if (unavailable || model.disabled) return;
        onChange(model.id);
        close();
    };
    const openMenu = (next: boolean, last = false) => {
        if (unavailable) return;
        if (next) setActiveId(enabled.find((model) => model.id === value)?.id ?? enabled[last ? enabled.length - 1 : 0].id);
        setOpen(next);
    };
    const navigate = (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === "Escape") {
            event.preventDefault();
            close();
        } else if (event.key === "Tab") {
            setOpen(false);
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
            event.preventDefault();
            const active = Math.max(
                0,
                enabled.findIndex((model) => model.id === activeId),
            );
            const index = event.key === "Home" ? 0 : event.key === "End" ? enabled.length - 1 : (active + (event.key === "ArrowDown" ? 1 : -1) + enabled.length) % enabled.length;
            if (enabled[index]) focusOption(enabled[index].id);
        } else if (event.key.length === 1 && event.key !== " ") {
            const match = enabled.find((model) => model.name.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()));
            if (match) {
                event.preventDefault();
                focusOption(match.id);
            }
        }
    };
    const list = (
        <div id={listId} className="vz-model-list" role="listbox" aria-label="选择模型" onKeyDown={navigate}>
            {models.map((model) => {
                const selected = model.id === value;
                return (
                    <button
                        key={model.id}
                        ref={(element) => {
                            if (element) {
                                options.current.set(model.id, element);
                                if (open && model.id === activeId && !unavailable && !model.disabled) element.focus();
                            } else options.current.delete(model.id);
                        }}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        aria-disabled={model.disabled || undefined}
                        disabled={disabled || model.disabled}
                        tabIndex={-1}
                        className="vz-model-opt"
                        onFocus={() => setActiveId(model.id)}
                        onClick={() => select(model)}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                select(model);
                            }
                        }}
                    >
                        <span className="vz-model-tag__logo vz-model-opt__logo" aria-hidden>
                            {model.vendor.slice(0, 1)}
                        </span>
                        <span className="vz-model-opt__body">
                            <span className="vz-model-opt__name">
                                <span>{model.name}</span>
                                {model.badges?.map((badge) => (
                                    <VzTag key={badge} tone={badge === "新" ? "accent" : "brand"}>
                                        {badge}
                                    </VzTag>
                                ))}
                            </span>
                            <span className="vz-caption">{model.disabled ? (model.disabledReason ?? "暂不可用") : model.desc}</span>
                        </span>
                        <span className="vz-model-opt__meta">
                            <span className="vz-caption vz-num">{`${model.cost} 积分`}</span>
                            {selected ? <Check aria-hidden className="vz-model-opt__check" /> : model.speed === "fast" ? <Zap aria-hidden className="vz-model-opt__fast" /> : null}
                        </span>
                    </button>
                );
            })}
        </div>
    );

    return (
        <Popover content={list} trigger="click" open={open && !unavailable} onOpenChange={(next) => openMenu(next)} placement="bottomLeft" arrow={false} getPopupContainer={getContainer}>
            <button
                ref={trigger}
                type="button"
                className="vz-model-trigger"
                aria-label="选择模型"
                aria-haspopup="listbox"
                aria-controls={listId}
                aria-expanded={open && !unavailable}
                disabled={unavailable}
                onKeyDown={(event) => {
                    if (open) {
                        if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            const active = enabled.find((model) => model.id === activeId);
                            if (active) select(active);
                        } else navigate(event);
                    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        openMenu(true, event.key === "ArrowUp");
                    }
                }}
            >
                <span className="vz-model-tag__logo vz-model-opt__logo" aria-hidden>
                    {current?.vendor.slice(0, 1) ?? "—"}
                </span>
                <span className="vz-model-opt__body">
                    <span className="vz-model-opt__name">
                        <span>{current?.name ?? "暂无可用模型"}</span>
                    </span>
                    <span className="vz-caption">{current ? `${current.vendor} · ${current.cost} 积分 / 次` : "模型列表为空"}</span>
                </span>
                <ChevronDown aria-hidden className="vz-model-trigger__chev" />
            </button>
        </Popover>
    );
}
