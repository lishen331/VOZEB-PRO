"use client";

import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";

export type LabFieldStatus = "error" | "warning" | "success";

function Field({ label, hint, status, extra, children }: { label?: ReactNode; hint?: ReactNode; status?: LabFieldStatus; extra?: ReactNode; children: (id: string, hintId?: string) => ReactNode }) {
    const id = useId();
    const hintId = hint ? `${id}-hint` : undefined;
    return (
        <div className="vzl-field" data-status={status}>
            {label ? (
                <label className="vzl-field__label" htmlFor={id}>
                    <span>{label}</span>
                    {extra}
                </label>
            ) : null}
            {children(id, hintId)}
            {hint ? (
                <span id={hintId} className="vzl-field__hint">
                    {hint}
                </span>
            ) : null}
        </div>
    );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label?: ReactNode; hint?: ReactNode; status?: LabFieldStatus; icon?: LucideIcon; suffix?: ReactNode; force?: "hover" | "focus"; round?: boolean };

export function LabInput({ label, hint, status, icon: Icon, suffix, force, round, disabled, className, ...rest }: InputProps) {
    return (
        <Field label={label} hint={hint} status={status}>
            {(id, hintId) => (
                <div className={cn("vzl-input", round && "vzl-input--search", className)} data-force={force} aria-disabled={disabled || undefined}>
                    {Icon ? <Icon aria-hidden /> : null}
                    <input id={id} disabled={disabled} aria-invalid={status === "error" || undefined} aria-describedby={hintId} {...rest} />
                    {suffix}
                </div>
            )}
        </Field>
    );
}

export function LabSearch(props: Omit<InputProps, "icon" | "round">) {
    return <LabInput icon={Search} round type="search" suffix={<kbd className="vzl-kbd">⌘ K</kbd>} {...props} />;
}

export function LabTextarea({ label, hint, status, maxLength, value, rows = 4, disabled, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: ReactNode; hint?: ReactNode; status?: LabFieldStatus }) {
    const length = typeof value === "string" ? value.length : 0;
    return (
        <Field label={label} hint={hint} status={status} extra={maxLength ? <span className="vzl-caption vzl-num">{`${length} / ${maxLength}`}</span> : undefined}>
            {(id, hintId) => (
                <div className="vzl-input vzl-input--multi" aria-disabled={disabled || undefined}>
                    <textarea id={id} rows={rows} value={value} maxLength={maxLength} disabled={disabled} aria-invalid={status === "error" || undefined} aria-describedby={hintId} {...rest} />
                </div>
            )}
        </Field>
    );
}
