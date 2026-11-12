"use client";

import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

export type VzFieldStatus = "error" | "warning" | "success";

type FieldShellProps = { label?: ReactNode; hint?: ReactNode; status?: VzFieldStatus; extra?: ReactNode; children: (id: string, hintId?: string) => ReactNode };

export function VzField({ label, hint, status, extra, children }: FieldShellProps) {
    const id = useId();
    const hintId = hint ? `${id}-hint` : undefined;
    return (
        <div className="vz-field" data-status={status}>
            {label ? (
                <label className="vz-field__label" htmlFor={id}>
                    <span>{label}</span>
                    {extra}
                </label>
            ) : null}
            {children(id, hintId)}
            {hint ? (
                <span id={hintId} className="vz-field__hint" role={status === "error" ? "alert" : undefined}>
                    {hint}
                </span>
            ) : null}
        </div>
    );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
    label?: ReactNode;
    hint?: ReactNode;
    status?: VzFieldStatus;
    icon?: LucideIcon;
    suffix?: ReactNode;
    force?: "hover" | "focus";
    shape?: "default" | "search";
};

export function VzInput({ label, hint, status, icon: Icon, suffix, force, shape = "default", disabled, className, ...rest }: InputProps) {
    return (
        <VzField label={label} hint={hint} status={status}>
            {(id, hintId) => (
                <div className={cn("vz-input", shape === "search" && "vz-input--search", className)} data-force={force} aria-disabled={disabled || undefined}>
                    {Icon ? <Icon aria-hidden /> : null}
                    <input id={id} disabled={disabled} aria-invalid={status === "error" || undefined} aria-describedby={hintId} {...rest} />
                    {suffix}
                </div>
            )}
        </VzField>
    );
}

export function VzSearch(props: Omit<InputProps, "icon" | "shape">) {
    return <VzInput icon={Search} shape="search" type="search" suffix={<kbd className="vz-kbd">⌘ K</kbd>} {...props} />;
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; status?: VzFieldStatus; maxLength?: number; footer?: ReactNode };

export function VzTextarea({ label, hint, status, maxLength, footer, value, rows = 4, disabled, ...rest }: TextareaProps) {
    const length = typeof value === "string" ? value.length : 0;
    return (
        <VzField label={label} hint={hint} status={status} extra={maxLength ? <span className="vz-caption vz-num">{`${length} / ${maxLength}`}</span> : undefined}>
            {(id, hintId) => (
                <div className="vz-input" style={{ height: "auto", padding: "10px 12px", flexDirection: "column", alignItems: "stretch" }} aria-disabled={disabled || undefined}>
                    <textarea id={id} rows={rows} value={value} maxLength={maxLength} disabled={disabled} aria-invalid={status === "error" || undefined} aria-describedby={hintId} {...rest} />
                    {footer}
                </div>
            )}
        </VzField>
    );
}
