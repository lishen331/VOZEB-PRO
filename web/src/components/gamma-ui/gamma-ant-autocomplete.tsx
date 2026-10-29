"use client";

/*
 * gamma-ui 的 antd AutoComplete 兼容层。基于 radix Popover 做建议下拉；输入框默认用本文件内的
 * 简单 input（与 gamma-ant-input 外观一致），也可以通过 children 传自定义输入元素（antd 同样支持）。
 * props 与 antd 同名同义，只实现站内实际用到的子集：options/value/placeholder/className/
 * filterOption/onChange/children。不支持 onSelect/onSearch（当前调用处都没用到）。
 * 画布不使用本文件。
 */

import type { ReactElement, ReactNode } from "react";
import { cloneElement, isValidElement, useMemo, useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

export interface AutoCompleteOption {
    value: string;
    label?: ReactNode;
}

export interface AutoCompleteProps {
    options?: readonly AutoCompleteOption[];
    value?: string;
    placeholder?: string;
    className?: string;
    filterOption?: boolean | ((input: string, option: AutoCompleteOption | undefined) => boolean);
    onChange?: (value: string) => void;
    children?: ReactNode;
}

function defaultFilter(input: string, option: AutoCompleteOption) {
    const text = typeof option.label === "string" ? option.label : option.value;
    return text.toLowerCase().includes(input.toLowerCase());
}

export function AutoComplete({ options = [], value, placeholder, className, filterOption, onChange, children }: AutoCompleteProps) {
    const [open, setOpen] = useState(false);
    const current = value ?? "";

    const filtered = useMemo(() => {
        if (!current.trim() || filterOption === false) return options;
        if (typeof filterOption === "function") return options.filter((option) => filterOption(current, option));
        return options.filter((option) => defaultFilter(current, option));
    }, [options, current, filterOption]);

    const commit = (next: string) => {
        onChange?.(next);
        setOpen(false);
    };

    const inputElement = isValidElement(children) ? (
        cloneElement(children as ReactElement<{ value?: string; placeholder?: string; onChange?: (event: React.ChangeEvent<HTMLInputElement>) => void; onFocus?: () => void }>, {
            value: current,
            placeholder,
            onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                onChange?.(event.target.value);
                setOpen(true);
            },
            onFocus: () => setOpen(true),
        })
    ) : (
        <input
            value={current}
            placeholder={placeholder}
            onChange={(event) => {
                onChange?.(event.target.value);
                setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            className="gm-input min-h-8 w-full rounded-[var(--gm-radius-sm)] border border-[var(--gm-border-strong)] bg-[var(--gm-surface)] px-2.5 text-[13px] text-[var(--gm-text)] outline-none placeholder:text-[var(--gm-text-3)] focus:border-[var(--gm-accent)]"
        />
    );

    return (
        <PopoverPrimitive.Root open={open && filtered.length > 0} onOpenChange={setOpen}>
            <PopoverPrimitive.Trigger asChild>
                <div className={cn("ant-select", className)}>{inputElement}</div>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal>
                <PopoverPrimitive.Content
                    align="start"
                    sideOffset={4}
                    onOpenAutoFocus={(event) => event.preventDefault()}
                    className="ant-select-dropdown z-[1050] max-h-64 w-[var(--radix-popover-trigger-width)] overflow-y-auto rounded-[var(--gm-radius)] border border-[var(--gm-border-strong)] bg-[var(--gm-surface-2)] p-1 shadow-[var(--gm-shadow)]"
                >
                    {filtered.map((option) => (
                        <button
                            key={option.value}
                            type="button"
                            className="ant-select-item-option flex min-h-8 w-full items-center rounded-[var(--gm-radius-sm)] px-2.5 text-left text-sm hover:bg-[var(--gm-wash)]"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => commit(option.value)}
                        >
                            {option.label ?? option.value}
                        </button>
                    ))}
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}
