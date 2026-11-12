"use client";

import { Popover } from "antd";
import { Check, ChevronDown, Zap } from "lucide-react";
import type { KeyboardEvent } from "react";
import { useId, useRef, useState } from "react";

import { LabTag } from "./primitives";

export type LabModel = { id: string; name: string; vendor: string; desc: string; cost: number; badge?: string; fast?: boolean; disabled?: boolean; disabledReason?: string };

export function LabModelPicker({ models, value, onChange, getContainer }: { models: LabModel[]; value: string; onChange: (id: string) => void; getContainer?: () => HTMLElement }) {
    const listId = useId();
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    const list = useRef<HTMLDivElement>(null);
    const current = models.find((model) => model.id === value) ?? models[0];

    const choose = (id: string) => {
        onChange(id);
        setOpen(false);
        trigger.current?.focus();
    };
    const onListKey = (event: KeyboardEvent<HTMLDivElement>) => {
        const items = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const step = event.key === "ArrowDown" ? 1 : -1;
            items[(index + step + items.length) % items.length]?.focus();
        } else if (event.key === "Escape") {
            setOpen(false);
            trigger.current?.focus();
        }
    };

    const content = (
        <div ref={list} id={listId} className="vzl-opt-list" role="listbox" aria-label="选择模型" onKeyDown={onListKey}>
            {models.map((model) => (
                <button key={model.id} type="button" role="option" aria-selected={model.id === value} disabled={model.disabled} className="vzl-opt" onClick={() => choose(model.id)}>
                    <span className="vzl-logo" aria-hidden>
                        {model.vendor.slice(0, 1)}
                    </span>
                    <span className="vzl-opt__body">
                        <span className="vzl-opt__name">
                            <span className="vzl-ellipsis">{model.name}</span>
                            {model.badge ? <LabTag tone={model.badge === "新" ? "accent" : "brand"}>{model.badge}</LabTag> : null}
                        </span>
                        <span className="vzl-caption vzl-ellipsis">{model.disabled ? model.disabledReason : model.desc}</span>
                    </span>
                    <span className="vzl-opt__meta">
                        <span className="vzl-caption vzl-num">{`${model.cost} 积分`}</span>
                        {model.id === value ? <Check aria-hidden /> : model.fast ? <Zap aria-hidden style={{ color: "var(--vzl-warning)" }} /> : null}
                    </span>
                </button>
            ))}
        </div>
    );

    return (
        <Popover
            content={content}
            trigger="click"
            open={open}
            onOpenChange={setOpen}
            afterOpenChange={(visible) => visible && list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()}
            placement="bottomLeft"
            arrow={false}
            getPopupContainer={getContainer}
        >
            <button
                ref={trigger}
                type="button"
                className="vzl-picker"
                aria-haspopup="listbox"
                aria-expanded={open}
                aria-controls={listId}
                onKeyDown={(event) => {
                    if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setOpen(true);
                    }
                }}
            >
                <span className="vzl-logo" aria-hidden>
                    {current.vendor.slice(0, 1)}
                </span>
                <span className="vzl-opt__body">
                    <span className="vzl-opt__name">
                        <span className="vzl-ellipsis">{current.name}</span>
                    </span>
                    <span className="vzl-caption vzl-ellipsis">{`${current.vendor} · ${current.cost} 积分 / 张`}</span>
                </span>
                <ChevronDown aria-hidden className="vzl-picker__chev" />
            </button>
        </Popover>
    );
}
