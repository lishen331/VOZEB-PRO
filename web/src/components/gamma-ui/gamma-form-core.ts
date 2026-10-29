/*
 * 表单校验内核（纯函数，可单测）。只做 gamma 表单需要的那部分：
 * 必填 / 长度 / 数值区间 / 正则 / 自定义校验，以及「交互后才报错、提交时全部报错」的时机规则。
 */

export type FieldValue = string | number | boolean | readonly string[] | null | undefined;

export interface FieldRule<T extends Record<string, FieldValue>> {
    required?: boolean | string;
    min?: number;
    max?: number;
    minLength?: number;
    maxLength?: number;
    pattern?: { test: RegExp; message: string };
    /** 返回错误文案即为不通过；可读取整张表单做联动校验 */
    validate?: (value: FieldValue, values: T) => string | undefined;
}

export type FormRules<T extends Record<string, FieldValue>> = Partial<Record<keyof T, FieldRule<T>>>;
export type FormErrors<T> = Partial<Record<keyof T, string>>;

function isEmpty(value: FieldValue) {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return value.trim() === "";
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

function lengthOf(value: FieldValue) {
    if (typeof value === "string") return [...value.trim()].length;
    if (Array.isArray(value)) return value.length;
    return 0;
}

export function validateField<T extends Record<string, FieldValue>>(value: FieldValue, rule: FieldRule<T> | undefined, values: T, label = "此项"): string | undefined {
    if (!rule) return undefined;
    if (isEmpty(value)) return rule.required ? (typeof rule.required === "string" ? rule.required : `请填写${label}`) : undefined;
    const unit = Array.isArray(value) ? "项" : "个字";
    if (rule.minLength !== undefined && lengthOf(value) < rule.minLength) return `${label}至少 ${rule.minLength} ${unit}`;
    if (rule.maxLength !== undefined && lengthOf(value) > rule.maxLength) return `${label}最多 ${rule.maxLength} ${unit}`;
    if (typeof value === "number") {
        if (rule.min !== undefined && value < rule.min) return `${label}不能小于 ${rule.min}`;
        if (rule.max !== undefined && value > rule.max) return `${label}不能大于 ${rule.max}`;
    }
    if (rule.pattern && typeof value === "string" && !rule.pattern.test.test(value)) return rule.pattern.message;
    return rule.validate?.(value, values);
}

export function validateAll<T extends Record<string, FieldValue>>(values: T, rules: FormRules<T>, labels: Partial<Record<keyof T, string>> = {}): FormErrors<T> {
    const errors: FormErrors<T> = {};
    for (const key of Object.keys(rules) as (keyof T)[]) {
        const message = validateField(values[key], rules[key], values, labels[key]);
        if (message) errors[key] = message;
    }
    return errors;
}

/** 报错时机：字段被碰过（失焦 / 改过）或已经提交过一次，才显示该字段的错误 */
export function visibleError<T>(errors: FormErrors<T>, key: keyof T, touched: Partial<Record<keyof T, boolean>>, submitted: boolean) {
    return touched[key] || submitted ? errors[key] : undefined;
}
