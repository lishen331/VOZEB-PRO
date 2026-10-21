"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { AlertCircle, Info } from "lucide-react";

import { validateAll, visibleError, type FieldValue, type FormErrors, type FormRules } from "@/components/gamma-ui/gamma-form-core";
import { cn } from "@/lib/utils";

/*
 * 表单：useGammaForm 管值 / 校验 / 提交态；GammaField 管布局（标签、必填星号、说明、字数、报错）。
 * 报错时机：碰过才报、提交时全报；提交失败会聚焦到第一个错误字段，错误字段轻微抖动。
 */

export function useGammaForm<T extends Record<string, FieldValue>>({ initial, rules = {}, labels = {}, onSubmit }: { initial: T; rules?: FormRules<T>; labels?: Partial<Record<keyof T, string>>; onSubmit: (values: T) => Promise<void> | void }) {
    const [values, setValues] = useState<T>(initial);
    const [touched, setTouched] = useState<Partial<Record<keyof T, boolean>>>({});
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [shake, setShake] = useState(0);
    const formRef = useRef<HTMLFormElement>(null);

    const errors: FormErrors<T> = useMemo(() => validateAll(values, rules, labels), [labels, rules, values]);
    const set = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
        setValues((current) => ({ ...current, [key]: value }));
        setTouched((current) => ({ ...current, [key]: true }));
    }, []);
    const touch = useCallback((key: keyof T) => setTouched((current) => ({ ...current, [key]: true })), []);
    const errorOf = (key: keyof T) => visibleError(errors, key, touched, submitted);

    const handleSubmit = async (event?: { preventDefault: () => void }) => {
        event?.preventDefault();
        setSubmitted(true);
        if (Object.keys(errors).length > 0) {
            setShake((value) => value + 1);
            // 聚焦第一个报错字段，屏幕阅读器会读出它关联的错误文案
            window.requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
            return;
        }
        setSubmitting(true);
        try {
            await onSubmit(values);
        } finally {
            setSubmitting(false);
        }
    };
    const reset = () => {
        setValues(initial);
        setTouched({});
        setSubmitted(false);
    };

    return { values, set, touch, errors, errorOf, submitted, submitting, shake, handleSubmit, reset, formRef, isValid: Object.keys(errors).length === 0 };
}

interface FieldContextValue {
    id: string | undefined;
    describedBy?: string;
    invalid: boolean;
}
const FieldContext = createContext<FieldContextValue | null>(null);

/** 子控件取 id / aria-describedby / invalid，接到自己的输入元素上 */
export function useGammaField(): FieldContextValue {
    return useContext(FieldContext) ?? { id: undefined, describedBy: undefined, invalid: false };
}

export interface GammaFieldProps {
    label: string;
    required?: boolean;
    hint?: ReactNode;
    error?: string;
    /** 当前长度 / 上限，显示在右上 */
    count?: [number, number];
    /** 横向布局：标签在左（设置页用） */
    inline?: boolean;
    /** 提交失败时抖一下（传 form.shake） */
    shakeKey?: number;
    children: ReactNode;
    className?: string;
}

export function GammaField({ label, required, hint, error, count, inline = false, shakeKey = 0, children, className }: GammaFieldProps) {
    const reduce = useReducedMotion();
    const id = useId();
    const descId = `${id}-desc`;
    const invalid = Boolean(error);
    const over = count ? count[0] > count[1] : false;
    return (
        <FieldContext.Provider value={{ id, describedBy: error || hint ? descId : undefined, invalid }}>
            {/* 不用 key 触发抖动：换 key 会重建整个字段（里面的选择器浮层、输入焦点都会丢） */}
            <motion.div
                animate={invalid && shakeKey > 0 && !reduce ? { x: shakeKey % 2 ? [0, -6, 6, -4, 4, 0] : [0, 6, -6, 4, -4, 0] } : { x: 0 }}
                transition={{ duration: 0.36 }}
                className={cn(inline ? "grid grid-cols-[160px_1fr] items-start gap-4" : "flex flex-col gap-1.5", className)}
            >
                <div className={cn("flex items-center gap-1 text-[13px]", inline && "pt-2.5")}>
                    <label htmlFor={id} className="font-medium text-[var(--gm-text)]">
                        {label}
                    </label>
                    {required ? (
                        <span aria-hidden className="text-[var(--gm-danger)]">
                            *
                        </span>
                    ) : null}
                    {count ? <span className={cn("ml-auto font-mono text-[11px] tabular-nums", over ? "text-[var(--gm-danger)]" : "text-[var(--gm-text-3)]")}>{`${count[0]}/${count[1]}`}</span> : null}
                </div>
                <div className="flex min-w-0 flex-col gap-1.5">
                    {children}
                    <AnimatePresence mode="wait" initial={false}>
                        {error ? (
                            <motion.p
                                key="error"
                                id={descId}
                                role="alert"
                                initial={{ opacity: 0, y: -4 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -4 }}
                                transition={{ duration: 0.16 }}
                                className="flex items-center gap-1 text-xs text-[var(--gm-danger)]"
                            >
                                <AlertCircle className="size-3.5 shrink-0" />
                                {error}
                            </motion.p>
                        ) : hint ? (
                            <motion.p key="hint" id={descId} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1 text-xs text-[var(--gm-text-3)]">
                                <Info className="size-3.5 shrink-0" />
                                {hint}
                            </motion.p>
                        ) : null}
                    </AnimatePresence>
                </div>
            </motion.div>
        </FieldContext.Provider>
    );
}

/** 基础输入框外观，表单里的 input / textarea 共用 */
export const GAMMA_FIELD_BOX =
    "w-full rounded-[var(--gm-radius)] bg-[var(--gm-surface)] px-3 text-sm text-[var(--gm-text)] ring-1 outline-none transition-shadow duration-200 placeholder:text-[var(--gm-text-3)] focus:shadow-[0_0_0_4px_var(--gm-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50";

export function gammaFieldRing(invalid: boolean) {
    return invalid ? "ring-[var(--gm-danger)] focus:ring-[var(--gm-danger)]" : "ring-[var(--gm-border)] hover:ring-[var(--gm-border-strong)] focus:ring-[var(--gm-accent)]";
}
