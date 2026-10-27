"use client";

/*
 * gamma-ui 的 antd Form 兼容层：props 与 antd 同名同义。
 * 页面只把 `import { Form } from "antd"` 改成从这里导入，调用处逻辑不动。
 *
 * 覆盖范围按实际用量确定（本次改版前全量扫描的结果）：
 *   <Form>       layout / form / onFinish / requiredMark / className / preserve
 *                initialValues / onValuesChange / disabled
 *   <Form.Item>  name / label / rules / extra / className / valuePropName
 *                shouldUpdate / noStyle / hidden / size / render-prop children
 *   Form.useForm setFieldsValue / setFieldValue / getFieldValue / getFieldsValue
 *                resetFields / validateFields / submit / isFieldsTouched
 *   Form.useWatch / Form.List / FormInstance
 *
 * 与 antd 的差异（都是刻意的取舍）：
 *   - 校验时机：字段被改动过、或表单提交过一次之后才显示错误（与 antd 一致）
 *   - 除 validator 外都是同步校验；validator 仍是 Promise，只在提交时执行
 *   - Form.List 只实现 fields / add / remove，不实现 move / insert
 *   - 画布及其共享组件不使用本文件（canvas-isolation.test.ts 守护）
 */

import type { CSSProperties, ReactElement, ReactNode } from "react";
import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useMemo, useRef, useSyncExternalStore } from "react";
import DisabledContext from "antd/es/config-provider/DisabledContext";
import { FormItemInputContext } from "antd/es/form/context";

import { cn } from "@/lib/utils";

export type NamePath = string | number | (string | number)[];

export interface FormRule {
    required?: boolean;
    /** required 时把纯空白也算作空 */
    whitespace?: boolean;
    /** 字符串按字符长度、数字按数值大小、数组按成员个数。给 min 时同理取最小值 */
    max?: number;
    min?: number;
    /**
     * 只为与 antd 调用处对齐。当前只影响 min 的判定口径（"array" 按数组成员数），
     * 其它取值不改变校验行为——校验仍以实际值为准。
     */
    type?: "string" | "number" | "array" | "boolean" | "email" | "url";
    message?: string;
    validator?: (rule: unknown, value: unknown) => Promise<void> | void;
}

export type FormRules = FormRule | FormRule[];

export class FormValidationError extends Error {
    readonly errorFields: { name: string; message: string }[];
    constructor(errors: Map<string, string>) {
        super("表单校验未通过");
        this.name = "FormValidationError";
        this.errorFields = [...errors].map(([name, message]) => ({ name, message }));
    }
}

function toPath(name: NamePath): (string | number)[] {
    return Array.isArray(name) ? name : [name];
}

function getIn(source: Record<string, unknown>, path: (string | number)[]): unknown {
    let cursor: unknown = source;
    for (const key of path) {
        if (cursor === null || cursor === undefined) return undefined;
        cursor = (cursor as Record<string | number, unknown>)[key];
    }
    return cursor;
}

/** 不可变写入：沿路径逐层复制，返回新对象 */
function setIn(source: Record<string, unknown>, path: (string | number)[], value: unknown): Record<string, unknown> {
    if (!path.length) return source;
    const [head, ...rest] = path;
    const current = source[head];
    if (!rest.length) return { ...source, [head]: value };
    const base =
        current && typeof current === "object"
            ? Array.isArray(current)
                ? ([...current] as unknown as Record<string, unknown>)
                : (current as Record<string, unknown>)
            : {};
    return { ...source, [head]: setIn(base, rest, value) };
}

function isEmptyValue(value: unknown, whitespace = false): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string") return whitespace ? value.trim() === "" : value === "";
    if (Array.isArray(value)) return value.length === 0;
    return false;
}

function cloneSafe<T>(value: T): T {
    if (typeof structuredClone === "function") {
        try {
            return structuredClone(value);
        } catch {
            // 含函数或类实例时退回浅拷贝，足够覆盖表单初始值
        }
    }
    return { ...(value as object) } as T;
}

export class FormStore {
    private values: Record<string, unknown>;
    private base: Record<string, unknown>;
    private errors = new Map<string, string>();
    private touched = new Set<string>();
    private submitted = false;
    private version = 0;
    private readonly listeners = new Set<() => void>();
    private rules = new Map<string, FormRule[]>();
    private labels = new Map<string, string>();
    private onFinish?: (values: Record<string, unknown>) => void | Promise<void>;
    private onValuesChange?: (changed: Record<string, unknown>, all: Record<string, unknown>) => void;
    private snapshots = new Map<string, unknown>();
    private snapshotVersion = -1;

    constructor(initialValues: Record<string, unknown> = {}) {
        this.base = cloneSafe(initialValues);
        this.values = cloneSafe(initialValues);
    }

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    getVersion = () => this.version;

    private emit() {
        this.version += 1;
        this.snapshots.clear();
        this.snapshotVersion = -1;
        for (const listener of this.listeners) listener();
    }

    /** 同一版本内返回引用稳定的值，避免 useSyncExternalStore 反复触发 */
    readValue = (path: string): unknown => {
        if (this.snapshotVersion !== this.version) {
            this.snapshots.clear();
            this.snapshotVersion = this.version;
        }
        if (this.snapshots.has(path)) return this.snapshots.get(path);
        const value = getIn(this.values, path.split("."));
        this.snapshots.set(path, value);
        return value;
    };

    setCallbacks(onFinish?: (values: Record<string, unknown>) => void | Promise<void>, onValuesChange?: (changed: Record<string, unknown>, all: Record<string, unknown>) => void) {
        this.onFinish = onFinish;
        this.onValuesChange = onValuesChange;
    }

    /** initialValues 挂载后灌入：同时更新基线，resetFields 才能回到这个值 */
    seed(initialValues: Record<string, unknown>) {
        this.base = cloneSafe(initialValues);
        this.values = cloneSafe(initialValues);
        this.emit();
    }

    registerField(name: string, rules: FormRule[] | undefined, label: string | undefined) {
        if (rules?.length) this.rules.set(name, rules);
        else this.rules.delete(name);
        if (label) this.labels.set(name, label);
    }

    unregisterField(name: string) {
        this.rules.delete(name);
        this.labels.delete(name);
        this.errors.delete(name);
        this.touched.delete(name);
    }

    getFieldValue = (name: NamePath): unknown => getIn(this.values, toPath(name));

    getFieldsValue = (): Record<string, unknown> => this.values;

    setFieldValue = (name: NamePath, value: unknown) => {
        const path = toPath(name);
        this.values = setIn(this.values, path, value);
        const key = path.join(".");
        this.touched.add(key);
        this.revalidate(key);
        this.onValuesChange?.({ [key]: value }, this.values);
        this.emit();
    };

    setFieldsValue = (next: Record<string, unknown>) => {
        let merged = this.values;
        for (const [key, value] of Object.entries(next)) merged = setIn(merged, toPath(key), value);
        this.values = merged;
        for (const key of this.rules.keys()) this.revalidate(key);
        this.onValuesChange?.(next, this.values);
        this.emit();
    };

    resetFields = (names?: NamePath[]) => {
        if (!names?.length) {
            this.values = cloneSafe(this.base);
            this.errors.clear();
            this.touched.clear();
            this.submitted = false;
            this.emit();
            return;
        }
        let next = this.values;
        for (const name of names) {
            const path = toPath(name);
            next = setIn(next, path, getIn(this.base, path));
            const key = path.join(".");
            this.errors.delete(key);
            this.touched.delete(key);
        }
        this.values = next;
        this.emit();
    };

    isFieldsTouched = (names?: NamePath[]) => {
        if (!names?.length) return this.touched.size > 0;
        return names.some((name) => this.touched.has(toPath(name).join(".")));
    };

    getError = (name: string): string | undefined => this.errors.get(name);

    /** 首次提交前不显示错误；改动过或提交过才显示 */
    isVisibleError = (name: string): boolean => this.submitted || this.touched.has(name);

    private checkSync(name: string, rules: FormRule[]): string | undefined {
        const value = getIn(this.values, name.split("."));
        const label = this.labels.get(name) ?? "此项";
        for (const rule of rules) {
            if (rule.required && isEmptyValue(value, rule.whitespace)) return rule.message ?? `请填写${label}`;
            if (rule.max !== undefined && !isEmptyValue(value)) {
                const over = typeof value === "string" ? [...value].length > rule.max : typeof value === "number" && value > rule.max;
                if (over) return rule.message ?? `不能超过 ${rule.max}`;
            }
            if (rule.min !== undefined && !isEmptyValue(value)) {
                // 按实际值判：数组数成员、字符串数字符、数字比大小
                const under = Array.isArray(value)
                    ? value.length < rule.min
                    : typeof value === "string"
                      ? [...value].length < rule.min
                      : typeof value === "number" && value < rule.min;
                if (under) return rule.message ?? `不能少于 ${rule.min}`;
            }
        }
        return undefined;
    }

    /** 输入过程中只跑同步规则；validator 留到提交 */
    private revalidate(name: string) {
        const rules = this.rules.get(name);
        if (!rules?.length) {
            this.errors.delete(name);
            return;
        }
        const message = this.checkSync(name, rules);
        if (message) this.errors.set(name, message);
        else this.errors.delete(name);
    }

    validateFields = async (names?: NamePath[]): Promise<Record<string, unknown>> => {
        const targets = names?.length ? names.map((name) => toPath(name).join(".")) : [...this.rules.keys()];
        this.submitted = true;
        const errors = new Map<string, string>();
        for (const name of targets) {
            const rules = this.rules.get(name);
            if (!rules?.length) continue;
            let message = this.checkSync(name, rules);
            if (!message) {
                const label = this.labels.get(name) ?? "此项";
                const value = getIn(this.values, name.split("."));
                for (const rule of rules) {
                    if (!rule.validator) continue;
                    try {
                        await rule.validator({ field: name }, value);
                    } catch (error) {
                        message = error instanceof Error ? error.message : `请检查${label}`;
                        break;
                    }
                }
            }
            if (message) errors.set(name, message);
            else this.errors.delete(name);
        }
        for (const [name, message] of errors) this.errors.set(name, message);
        this.emit();
        if (errors.size) throw new FormValidationError(errors);
        return this.values;
    };

    /**
     * 与 antd 一致：校验不通过时只把错误显示出来，不当成异常抛出。
     * 这里必须吞掉 FormValidationError，否则每次空表单提交都会留下未处理的 Promise 拒绝。
     */
    submit = () => {
        void this.validateFields().then(
            () => this.onFinish?.(this.values),
            () => undefined,
        );
    };
}

export interface FormInstance<Values = Record<string, unknown>> {
    // antd 原签名就是返回 any。不写 unknown 是因为页面里大量 `getFieldValue("style") || "未选择"`
    // 这种写法：返回 unknown 时整个表达式退化成 {}，直接进不了 JSX，会逼调用方到处断言。
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getFieldValue: (name: NamePath) => any;
    getFieldsValue: (all?: boolean) => Values;
    setFieldValue: (name: NamePath, value: unknown) => void;
    /** 与 antd 一致：接受表单值的部分字段，也接受整条记录（如 PromptTemplate） */
    setFieldsValue: (values: Partial<Values> | object) => void;
    resetFields: (names?: NamePath[]) => void;
    validateFields: (names?: NamePath[]) => Promise<Values>;
    submit: () => void;
    isFieldsTouched: (names?: NamePath[]) => boolean;
    /** 内部：Form.Item / useWatch 从这里读同一个 store */
    __store: FormStore;
}

/* ===== 上下文 ===== */

type FormLayout = "horizontal" | "vertical";

interface FormContextValue {
    store: FormStore;
    layout: FormLayout;
    requiredMark: boolean;
    disabled: boolean;
}

const FormContext = createContext<FormContextValue | null>(null);
const PreserveContext = createContext(true);
/**
 * Form.List 的路径前缀。
 * antd 里 <Form.List name="items"> 内部的 <Form.Item name={[index, "kind"]}> 会自动拼成
 * items.0.kind；没有这层前缀，字段会落到 0.kind 上，列表增删和保存全是错的。
 */
const ListPrefixContext = createContext<(string | number)[]>([]);

function useFormContext(component: string): FormContextValue {
    const context = useContext(FormContext);
    if (!context) throw new Error(`<${component}> 必须放在 <Form> 内使用`);
    return context;
}

/* ===== useForm ===== */

/**
 * Values 只约束到 object：antd 的表单值类型常写成 interface（如 GenerationSettings），
 * 而 Record<string, unknown> 要求索引签名，interface 不满足，会逼调用方到处加类型断言。
 *
 * 不给泛型时默认 any（与 antd 一致）：页面里 getFieldsValue().xxx 这类写法是常态，
 * 默认 unknown 会让它们全线报错。显式写了泛型的调用点仍然享有完整类型。
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useForm<Values extends object = any>(initialValues?: Partial<Values>): [FormInstance<Values>] {
    const storeRef = useRef<FormStore | null>(null);
    if (!storeRef.current) storeRef.current = new FormStore((initialValues ?? {}) as Record<string, unknown>);
    const store = storeRef.current;
    const instance = useMemo<FormInstance<Values>>(
        () => ({
            __store: store,
            // store 只能给出 unknown，这里补上按 keyof Values 反推的调用签名
            getFieldValue: store.getFieldValue as FormInstance<Values>["getFieldValue"],
            getFieldsValue: () => store.getFieldsValue() as Values,
            setFieldValue: store.setFieldValue,
            // store 内部按 Record 存值，对外接受任意记录（interface 类型也能直接传）
            setFieldsValue: store.setFieldsValue as FormInstance<Values>["setFieldsValue"],
            resetFields: store.resetFields,
            validateFields: (names?: NamePath[]) => store.validateFields(names) as Promise<Values>,
            submit: store.submit,
            isFieldsTouched: store.isFieldsTouched,
        }),
        [store],
    );
    return [instance];
}

/* ===== useWatch ===== */

const NO_STORE = "__no_store__";

/**
 * 订阅单个字段。
 * 返回值类型从 form 实例反推（antd 的行为）：useWatch("sourceType", form) 拿到的是
 * EditorValues["sourceType"] 而不是 unknown，否则页面里 `watch(name) || "默认值"`
 * 这种写法会全线退化成 {}，索引和 .trim() 都会报错。
 */
export function useWatch<Values extends object = Record<string, unknown>, K extends keyof Values & (string | number) = keyof Values & (string | number)>(name: K, form: FormInstance<Values>): Values[K];
export function useWatch(name: NamePath): unknown;
export function useWatch(name: NamePath, form?: FormInstance): unknown;
export function useWatch(name: NamePath, form?: FormInstance<Record<string, unknown>>): unknown {
    const fallback = useContext(FormContext);
    // hook 无条件调用，store 缺失时退到占位快照，最后才抛错
    const store = form?.__store ?? fallback?.store;
    const path = toPath(name).join(".");
    const subscribe = useCallback((listener: () => void) => (store ? store.subscribe(listener) : () => {}), [store]);
    const getSnapshot = useCallback(() => (store ? store.readValue(path) : NO_STORE), [store, path]);
    const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    if (!store) throw new Error("<Form.useWatch> 需要传入 form 实例，或放在 <Form> 内");
    return value;
}

/* ===== Form ===== */

export interface FormProps<Values extends object = Record<string, unknown>> {
    form?: FormInstance<Values>;
    layout?: FormLayout;
    onFinish?: (values: Values) => void | Promise<void>;
    onValuesChange?: (changed: Record<string, unknown>, all: Values) => void;
    requiredMark?: boolean;
    /** antd 语义：false 时字段卸载即丢弃值 */
    preserve?: boolean;
    initialValues?: Partial<Values>;
    disabled?: boolean;
    className?: string;
    style?: CSSProperties;
    id?: string;
    children?: ReactNode;
    "aria-label"?: string;
}

function FormRoot<Values extends object = Record<string, unknown>>({
    form,
    layout = "horizontal",
    onFinish,
    onValuesChange,
    requiredMark = true,
    preserve = true,
    initialValues,
    disabled = false,
    className,
    style,
    id,
    children,
    "aria-label": ariaLabel,
}: FormProps<Values>) {
    const [fallback] = useForm<Record<string, unknown>>(initialValues as Record<string, unknown> | undefined);
    const instance = (form ?? fallback) as FormInstance<Record<string, unknown>>;
    const store = instance.__store;

    // 回调随渲染更新，避免闭包拿到旧的 onFinish
    useEffect(() => {
        store.setCallbacks(
            onFinish as ((values: Record<string, unknown>) => void | Promise<void>) | undefined,
            onValuesChange as ((changed: Record<string, unknown>, all: Record<string, unknown>) => void) | undefined,
        );
    }, [store, onFinish, onValuesChange]);

    // initialValues 只在首次挂载灌入（与 antd 一致）
    const seeded = useRef(false);
    const initialRef = useRef(initialValues);
    useEffect(() => {
        if (seeded.current || !initialRef.current) return;
        seeded.current = true;
        store.seed(initialRef.current);
    }, [store]);

    const context = useMemo<FormContextValue>(() => ({ store, layout, requiredMark, disabled }), [store, layout, requiredMark, disabled]);

    return (
        <FormContext.Provider value={context}>
            <DisabledContext.Provider value={disabled}>
                <form
                    id={id}
                    aria-label={ariaLabel}
                    style={style}
                    className={cn("gm-form", layout === "vertical" ? "flex flex-col gap-3" : "flex flex-col gap-2", className)}
                    onSubmit={(event) => {
                        event.preventDefault();
                        instance.submit();
                    }}
                    noValidate
                >
                    <PreserveContext.Provider value={preserve}>{children}</PreserveContext.Provider>
                </form>
            </DisabledContext.Provider>
        </FormContext.Provider>
    );
}

/* ===== Form.Item ===== */

export interface FormItemProps {
    name?: NamePath;
    label?: ReactNode;
    rules?: FormRules;
    /** 只标必填星号、不参与校验（如自定义上传控件，值不由 Form 管） */
    required?: boolean;
    extra?: ReactNode;
    className?: string;
    style?: CSSProperties;
    /** 子控件的值属性名：复选框/开关用 "checked" */
    valuePropName?: string;
    /** antd 原签名就是 any：调用处会直接点取嵌套路径（prev.items?.[i]?.kind） */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    shouldUpdate?: boolean | ((prev: any, next: any) => boolean);
    noStyle?: boolean;
    hidden?: boolean;
    size?: "small" | "middle" | "large";
    children?: ReactNode | ((field: { getFieldValue: (name: NamePath) => unknown; getFieldsValue: () => Record<string, unknown>; setFieldsValue: (values: Record<string, unknown>) => void }) => ReactNode);
}

function normalizeRules(rules?: FormRules): FormRule[] {
    if (!rules) return [];
    return Array.isArray(rules) ? rules : [rules];
}

/** 从 onChange 参数取本次值：Input 给事件对象，Select / Switch / Checkbox 直接给值 */
function extractValue(arg: unknown, valuePropName: string): unknown {
    if (arg && typeof arg === "object" && "target" in arg) {
        const target = (arg as { target?: { value?: unknown; checked?: boolean } }).target;
        return valuePropName === "checked" ? target?.checked : target?.value;
    }
    return arg;
}

function FormItem({ name, label, rules, required, extra, className, style, valuePropName = "value", shouldUpdate, noStyle = false, hidden = false, children }: FormItemProps) {
    const { store, layout, requiredMark, disabled } = useFormContext("Form.Item");
    const preserve = useContext(PreserveContext);
    const listPrefix = useContext(ListPrefixContext);
    // 与 antd 一致：Form.List 内的 name 会拼上列表名与行号
    const path = name === undefined ? undefined : [...listPrefix, ...toPath(name)].join(".");
    const ruleList = normalizeRules(rules);
    const ruleSignature = JSON.stringify(ruleList);
    const labelText = typeof label === "string" ? label : undefined;
    const autoId = useId();
    const fieldId = `${autoId}-field`;

    const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
    // shouldUpdate 的 Item 不带 name，读占位路径只会拿到同一个 undefined，store 变化后
    // useSyncExternalStore 会因值相同而不重渲染，渲染函数就永远看不到新值。
    // 这类 Item 改成订阅版本号。比较函数本身忽略：重渲染多几次，结果一致。
    const watchesAll = shouldUpdate !== undefined && shouldUpdate !== false;
    // 无 name 的 Item（纯布局）用固定占位路径，保证 hook 调用顺序一致
    const getSnapshot = useCallback(() => (watchesAll ? store.getVersion() : store.readValue(path ?? `__item_${autoId}`)), [store, path, autoId, watchesAll]);
    const version = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

    const error = path ? store.getError(path) : undefined;
    const visibleError = path && store.isVisibleError(path) ? error : undefined;
    // 显式 required 只为画星号（值不由 Form 管的控件），不参与校验
    const isRequired = requiredMark && (required === true || ruleList.some((rule) => rule.required));

    useEffect(() => {
        if (!path) return;
        store.registerField(path, ruleList, labelText);
        return () => {
            if (!preserve) store.setFieldsValue({ [path]: undefined });
            store.unregisterField(path);
        };
        // ruleList 每次渲染都是新数组，用签名比较避免无限注册
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [store, path, ruleSignature, labelText, preserve]);

    const control = useMemo(() => {
        if (path === undefined || typeof children === "function") {
            if (typeof children === "function") {
                return children({ getFieldValue: store.getFieldValue, getFieldsValue: store.getFieldsValue, setFieldsValue: store.setFieldsValue });
            }
            return children;
        }
        if (!isValidElement(children)) return children;
        const element = children as ReactElement<Record<string, unknown>>;
        const original = element.props as { onChange?: (...args: unknown[]) => void; id?: string; disabled?: boolean; [key: string]: unknown };
        const currentValue = store.readValue(path);
        return cloneElement(element, {
            id: original.id ?? fieldId,
            "aria-invalid": visibleError ? true : undefined,
            "aria-describedby": visibleError ? `${autoId}-error` : undefined,
            disabled: original.disabled ?? disabled,
            [valuePropName]: currentValue ?? (valuePropName === "checked" ? false : ""),
            onChange: (...args: unknown[]) => {
                original.onChange?.(...args);
                store.setFieldValue(path, extractValue(args[0], valuePropName));
            },
        });
        // version 保证依赖字段变化后重新注入最新值
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [children, path, valuePropName, visibleError, disabled, fieldId, autoId, version, store]);

    if (noStyle) return <>{control}</>;

    return (
        <FormItemInputContext.Provider value={{ status: visibleError ? "error" : undefined, isFormItemInput: true } as never}>
            <div
                style={style}
                hidden={hidden}
                className={cn("gm-form-item", layout === "vertical" ? "flex flex-col gap-1.5" : "grid grid-cols-[160px_1fr] items-start gap-3", className)}
            >
                {label !== undefined && label !== null ? (
                    <label htmlFor={fieldId} className="flex items-center gap-1 text-[13px] font-medium text-[var(--gm-text)]">
                        {label}
                        {isRequired ? (
                            <span aria-hidden className="text-[var(--gm-danger)]">
                                *
                            </span>
                        ) : null}
                    </label>
                ) : null}
                <div className="flex min-w-0 flex-col gap-1">
                    {control}
                    {visibleError ? (
                        <p id={`${autoId}-error`} role="alert" className="text-xs text-[var(--gm-danger)]">
                            {visibleError}
                        </p>
                    ) : extra ? (
                        <p className="text-xs text-[var(--gm-text-3)]">{extra}</p>
                    ) : null}
                </div>
            </div>
        </FormItemInputContext.Provider>
    );
}

/* ===== Form.List ===== */

export interface FormListField {
    key: number;
    name: number;
}

export interface FormListOperation {
    add: (defaultValue?: Record<string, unknown>) => void;
    remove: (index: number | number[]) => void;
}

export interface FormListProps {
    name: string;
    children: (fields: FormListField[], operation: FormListOperation) => ReactNode;
    initialValue?: Record<string, unknown>[];
}

function FormList({ name, children, initialValue = [] }: FormListProps) {
    const { store } = useFormContext("Form.List");
    const parentPrefix = useContext(ListPrefixContext);
    // 嵌套 List：路径要接着上一层的 列表名.行号 往下拼
    const listPath = [...parentPrefix, ...toPath(name)];
    const listKey = listPath.join(".");

    const subscribe = useCallback((listener: () => void) => store.subscribe(listener), [store]);
    const getSnapshot = useCallback(() => store.readValue(listKey), [store, listKey]);
    const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const items = Array.isArray(value) ? (value as Record<string, unknown>[]) : initialValue;

    const fields: FormListField[] = items.map((_, index) => ({ key: index, name: index }));

    const readItems = (): unknown[] => {
        const current = store.getFieldValue(listKey);
        return Array.isArray(current) ? [...current] : [];
    };

    const operation: FormListOperation = {
        add: (defaultValue = {}) => store.setFieldValue(listKey, [...readItems(), defaultValue]),
        remove: (index) => {
            const drop = new Set(Array.isArray(index) ? index : [index]);
            store.setFieldValue(
                listKey,
                readItems().filter((_, i) => !drop.has(i)),
            );
        },
    };

    return <ListPrefixContext.Provider value={listPath}>{children(fields, operation)}</ListPrefixContext.Provider>;
}

/* ===== 静态成员：与 antd 的 Form.Item / Form.List / Form.useForm 形态对齐 ===== */

FormRoot.Item = FormItem;
FormRoot.List = FormList;
FormRoot.useForm = useForm;
FormRoot.useWatch = useWatch;

export const Form = FormRoot;
