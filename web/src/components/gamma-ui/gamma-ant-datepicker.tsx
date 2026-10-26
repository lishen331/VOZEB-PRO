"use client";

/*
 * gamma-ui 的 antd 兼容层：DatePicker / DatePicker.RangePicker。
 * 值类型保持 dayjs，不做历史兼容；只覆盖站内用到的部分：
 * value/onChange/allowClear/placeholder/showTime/disabled/className/format（RangePicker 还有 separator）。
 * 不支持 picker="week"/"month"/"year"、disabledDate、cellRender、presets。
 * 画布及其共享组件不使用本文件。
 */

import type { ReactNode } from "react";
import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import dayjs, { type Dayjs } from "dayjs";
import DisabledContext from "antd/es/config-provider/DisabledContext";

import { cn } from "@/lib/utils";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

function buildMonthGrid(month: Dayjs) {
    const start = month.startOf("month").startOf("week");
    return Array.from({ length: 42 }, (_, index) => start.add(index, "day"));
}

function clampTime(date: Dayjs, time: Dayjs) {
    return date.hour(time.hour()).minute(time.minute()).second(time.second());
}

interface TimeEditorProps {
    value: Dayjs;
    onChange: (next: Dayjs) => void;
}

function TimeEditor({ value, onChange }: TimeEditorProps) {
    const part = (unit: "hour" | "minute" | "second", max: number) => (
        <input
            key={unit}
            type="number"
            min={0}
            max={max}
            value={String(value[unit]()).padStart(2, "0")}
            onChange={(event) => {
                const next = Math.min(max, Math.max(0, Number(event.target.value) || 0));
                onChange(value[unit](next));
            }}
            className="w-12 rounded-[var(--gm-radius-sm)] bg-[var(--gm-surface-2)] px-1.5 py-1 text-center text-sm tabular-nums outline-none ring-1 ring-[var(--gm-border)] focus-visible:ring-[var(--gm-accent)]"
        />
    );
    return (
        <div className="flex items-center gap-1 text-[var(--gm-text-3)]">
            {part("hour", 23)}
            <span>:</span>
            {part("minute", 59)}
            <span>:</span>
            {part("second", 59)}
        </div>
    );
}

interface MonthCalendarProps {
    month: Dayjs;
    onMonthChange: (next: Dayjs) => void;
    isSelected: (day: Dayjs) => boolean;
    isInRange?: (day: Dayjs) => boolean;
    onPick: (day: Dayjs) => void;
}

function MonthCalendar({ month, onMonthChange, isSelected, isInRange, onPick }: MonthCalendarProps) {
    const days = useMemo(() => buildMonthGrid(month), [month]);
    const today = dayjs();
    return (
        <div className="w-[260px] p-2">
            <div className="mb-2 flex items-center justify-between px-1">
                <button
                    type="button"
                    aria-label="上一月"
                    onClick={() => onMonthChange(month.subtract(1, "month"))}
                    className="grid size-6 place-items-center rounded-[var(--gm-radius-sm)] text-[var(--gm-text-3)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]"
                >
                    <ChevronLeft className="size-4" />
                </button>
                <span className="text-sm font-medium text-[var(--gm-text)]">{month.format("YYYY年M月")}</span>
                <button
                    type="button"
                    aria-label="下一月"
                    onClick={() => onMonthChange(month.add(1, "month"))}
                    className="grid size-6 place-items-center rounded-[var(--gm-radius-sm)] text-[var(--gm-text-3)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]"
                >
                    <ChevronRight className="size-4" />
                </button>
            </div>
            <div className="grid grid-cols-7 gap-y-1 text-center text-xs text-[var(--gm-text-3)]">
                {WEEKDAY_LABELS.map((label) => (
                    <span key={label} className="py-1">
                        {label}
                    </span>
                ))}
                {days.map((day) => {
                    const outside = !day.isSame(month, "month");
                    const selected = isSelected(day);
                    const inRange = isInRange?.(day) && !selected;
                    return (
                        <button
                            key={day.format("YYYY-MM-DD")}
                            type="button"
                            onClick={() => onPick(day)}
                            className={cn(
                                "mx-auto grid size-8 place-items-center rounded-[var(--gm-radius-sm)] text-sm transition-colors",
                                outside && "text-[var(--gm-text-3)] opacity-40",
                                !outside && !selected && "text-[var(--gm-text)] hover:bg-[var(--gm-wash-strong)]",
                                inRange && "bg-[var(--gm-accent-soft)]",
                                selected && "bg-[var(--gm-accent)] text-[var(--gm-bg)]",
                                !selected && day.isSame(today, "day") && "ring-1 ring-[var(--gm-accent)]",
                            )}
                        >
                            {day.date()}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

function useThemeRoot(open: boolean, anchorRef: React.RefObject<HTMLElement | null>) {
    const [themeRoot, setThemeRoot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        if (open) setThemeRoot((anchorRef.current?.closest(".gm") as HTMLElement | null) ?? null);
    }, [open, anchorRef]);
    return themeRoot;
}

const TRIGGER_CLASS =
    "group flex min-h-8 w-full items-center gap-2 rounded-[var(--gm-radius-sm)] bg-[var(--gm-surface)] px-2.5 py-1 text-left text-[13px] ring-1 ring-[var(--gm-border)] transition-shadow duration-200 hover:ring-[var(--gm-border-strong)] focus-visible:outline-none focus-visible:shadow-[0_0_0_4px_var(--gm-accent-soft)] focus-visible:ring-[var(--gm-accent)] disabled:cursor-not-allowed disabled:opacity-50";

const CONTENT_CLASS = "gm-glass gm-glass-strong z-[140] overflow-hidden rounded-[var(--gm-radius-lg)] p-1 shadow-[var(--gm-shadow)] outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95";

export interface DatePickerProps {
    value?: Dayjs | null;
    onChange?: (value: Dayjs | null) => void;
    allowClear?: boolean;
    placeholder?: string;
    showTime?: boolean;
    disabled?: boolean;
    className?: string;
}

export function DatePicker({ value, onChange, allowClear = false, placeholder = "请选择日期", showTime = false, disabled, className }: DatePickerProps) {
    const contextDisabled = useContext(DisabledContext);
    const isDisabled = disabled ?? contextDisabled ?? false;
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const themeRoot = useThemeRoot(open, triggerRef);
    const [month, setMonth] = useState(() => value ?? dayjs());
    const [pending, setPending] = useState<Dayjs | null>(value ?? null);

    useEffect(() => {
        if (open) {
            setPending(value ?? null);
            setMonth(value ?? dayjs());
        }
    }, [open, value]);

    const commit = (next: Dayjs | null) => {
        onChange?.(next);
        setOpen(false);
    };

    const format = showTime ? "YYYY-MM-DD HH:mm:ss" : "YYYY-MM-DD";

    return (
        <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
            <PopoverPrimitive.Trigger asChild disabled={isDisabled}>
                <button ref={triggerRef} type="button" disabled={isDisabled} className={cn(TRIGGER_CLASS, className)}>
                    <Calendar className="size-4 shrink-0 text-[var(--gm-text-3)]" />
                    <span className={cn("min-w-0 flex-1 truncate tabular-nums", value ? "text-[var(--gm-text)]" : "text-[var(--gm-text-3)]")}>{value ? value.format(format) : placeholder}</span>
                    {allowClear && value && !isDisabled ? (
                        <span
                            role="button"
                            tabIndex={-1}
                            aria-label="清空"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                                event.stopPropagation();
                                onChange?.(null);
                            }}
                            className="grid size-5 shrink-0 place-items-center rounded-full text-[var(--gm-text-3)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]"
                        >
                            <X className="size-3.5" />
                        </span>
                    ) : null}
                </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal container={themeRoot}>
                <PopoverPrimitive.Content align="start" sideOffset={6} collisionPadding={12} className={CONTENT_CLASS}>
                    <MonthCalendar
                        month={month}
                        onMonthChange={setMonth}
                        isSelected={(day) => Boolean(pending?.isSame(day, "day"))}
                        onPick={(day) => {
                            const base = pending ?? dayjs();
                            const next = showTime ? clampTime(day, base) : day.startOf("day");
                            if (showTime) setPending(next);
                            else commit(next);
                        }}
                    />
                    {showTime ? (
                        <div className="flex items-center justify-between gap-2 border-t border-[var(--gm-border)] px-2 py-2">
                            <TimeEditor value={pending ?? dayjs()} onChange={(next) => setPending(next)} />
                            <button type="button" onClick={() => commit(pending ?? dayjs())} className="rounded-[var(--gm-radius-sm)] bg-[var(--gm-accent)] px-3 py-1 text-xs font-medium text-[var(--gm-bg)] hover:opacity-90">
                                确定
                            </button>
                        </div>
                    ) : null}
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}

export type DateRangeValue = [Dayjs | null, Dayjs | null] | null;

export interface RangePickerProps {
    value?: DateRangeValue;
    onChange?: (value: DateRangeValue) => void;
    allowClear?: boolean;
    placeholder?: [string, string];
    separator?: ReactNode;
    showTime?: boolean;
    disabled?: boolean;
    format?: string;
    className?: string;
}

function RangePicker({ value, onChange, allowClear = false, placeholder = ["开始日期", "结束日期"], separator = "~", showTime = false, disabled, format, className }: RangePickerProps) {
    const contextDisabled = useContext(DisabledContext);
    const isDisabled = disabled ?? contextDisabled ?? false;
    const triggerRef = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const themeRoot = useThemeRoot(open, triggerRef);
    const [month, setMonth] = useState(dayjs());
    const [start, setStart] = useState<Dayjs | null>(null);
    const [end, setEnd] = useState<Dayjs | null>(null);
    const [phase, setPhase] = useState<"start" | "end">("start");

    useEffect(() => {
        if (open) {
            const [s, e] = value ?? [null, null];
            setStart(s ?? null);
            setEnd(e ?? null);
            setPhase(s && !e ? "end" : "start");
            setMonth(s ?? dayjs());
        }
    }, [open, value]);

    const resolvedFormat = format ?? (showTime ? "YYYY-MM-DD HH:mm:ss" : "YYYY-MM-DD");

    const commit = (nextStart: Dayjs | null, nextEnd: Dayjs | null) => {
        onChange?.(nextStart || nextEnd ? [nextStart, nextEnd] : null);
        setOpen(false);
    };

    const pick = (day: Dayjs) => {
        if (phase === "start" || (start && end)) {
            const base = showTime ? clampTime(day, start ?? dayjs()) : day.startOf("day");
            setStart(base);
            setEnd(null);
            setPhase("end");
            return;
        }
        let nextStart = start!;
        let nextEnd = showTime ? clampTime(day, end ?? dayjs()) : day.startOf("day");
        if (nextEnd.isBefore(nextStart, "day")) [nextStart, nextEnd] = [nextEnd, nextStart];
        setStart(nextStart);
        setEnd(nextEnd);
        setPhase("start");
        if (!showTime) commit(nextStart, nextEnd);
    };

    const display = (day: Dayjs | null, fallback: string) => (day ? day.format(resolvedFormat) : fallback);

    return (
        <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
            <PopoverPrimitive.Trigger asChild disabled={isDisabled}>
                <button ref={triggerRef} type="button" disabled={isDisabled} className={cn(TRIGGER_CLASS, className)}>
                    <Calendar className="size-4 shrink-0 text-[var(--gm-text-3)]" />
                    <span className={cn("truncate tabular-nums", start ? "text-[var(--gm-text)]" : "text-[var(--gm-text-3)]")}>{display(start, placeholder[0])}</span>
                    <span className="text-[var(--gm-text-3)]">{separator}</span>
                    <span className={cn("min-w-0 flex-1 truncate tabular-nums", end ? "text-[var(--gm-text)]" : "text-[var(--gm-text-3)]")}>{display(end, placeholder[1])}</span>
                    {allowClear && (start || end) && !isDisabled ? (
                        <span
                            role="button"
                            tabIndex={-1}
                            aria-label="清空"
                            onPointerDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                                event.stopPropagation();
                                onChange?.(null);
                            }}
                            className="grid size-5 shrink-0 place-items-center rounded-full text-[var(--gm-text-3)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]"
                        >
                            <X className="size-3.5" />
                        </span>
                    ) : null}
                </button>
            </PopoverPrimitive.Trigger>
            <PopoverPrimitive.Portal container={themeRoot}>
                <PopoverPrimitive.Content align="start" sideOffset={6} collisionPadding={12} className={CONTENT_CLASS}>
                    <MonthCalendar
                        month={month}
                        onMonthChange={setMonth}
                        isSelected={(day) => Boolean(start?.isSame(day, "day") || end?.isSame(day, "day"))}
                        isInRange={(day) => Boolean(start && end && day.isAfter(start, "day") && day.isBefore(end, "day"))}
                        onPick={pick}
                    />
                    {showTime ? (
                        <div className="flex flex-col gap-2 border-t border-[var(--gm-border)] px-2 py-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-[var(--gm-text-3)]">开始</span>
                                <TimeEditor value={start ?? dayjs()} onChange={(next) => setStart(next)} />
                            </div>
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-xs text-[var(--gm-text-3)]">结束</span>
                                <TimeEditor value={end ?? dayjs()} onChange={(next) => setEnd(next)} />
                            </div>
                            <button
                                type="button"
                                disabled={!start || !end}
                                onClick={() => commit(start, end)}
                                className="self-end rounded-[var(--gm-radius-sm)] bg-[var(--gm-accent)] px-3 py-1 text-xs font-medium text-[var(--gm-bg)] hover:opacity-90 disabled:opacity-50"
                            >
                                确定
                            </button>
                        </div>
                    ) : null}
                </PopoverPrimitive.Content>
            </PopoverPrimitive.Portal>
        </PopoverPrimitive.Root>
    );
}

DatePicker.RangePicker = RangePicker;
