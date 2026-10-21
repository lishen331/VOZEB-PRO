"use client";

/*
 * gamma-ui 的 antd App 兼容层：只为非画布页面提供 message / modal 实例。
 * 调用点真正用到的面：message.success/error/warning/info/loading/destroy、
 * message.useMessage()、modal.confirm/info/warning。
 * 画布及其共享组件继续用 antd 的 App，不走本文件。
 */

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { GammaButton } from "@/components/gamma-ui/gamma-button";
import { GammaModal, GammaToastStack, type GammaToastItem, type GammaToastTone } from "@/components/gamma-ui/gamma-overlays";

/** antd message 允许的调用形态：内容本身，或带 key/duration 的对象 */
export type MessageContent = ReactNode;
export interface MessageConfig {
    content?: MessageContent;
    /** 同 key 的提示会原地替换，用于 loading → success 的流转 */
    key?: string | number;
    duration?: number;
    onClose?: () => void;
}
type MessageArg = MessageContent | MessageConfig;

const isConfig = (value: MessageArg): value is MessageConfig => typeof value === "object" && value !== null && !Array.isArray(value) && "content" in (value as object);

/** 与 antd MessageType 结构一致：可直接调用关闭，也可 await */
export interface MessageType extends PromiseLike<boolean> {
    (): void;
}

export interface MessageInstance {
    success: (arg: MessageArg, duration?: number) => MessageType;
    error: (arg: MessageArg, duration?: number) => MessageType;
    warning: (arg: MessageArg, duration?: number) => MessageType;
    info: (arg: MessageArg, duration?: number) => MessageType;
    loading: (arg: MessageArg, duration?: number) => MessageType;
    open: (args: MessageConfig & { content: ReactNode }) => MessageType;
    destroy: (key?: string | number) => void;
}

export interface ModalFuncProps {
    title?: ReactNode;
    content?: ReactNode;
    okText?: ReactNode;
    cancelText?: ReactNode;
    okButtonProps?: { danger?: boolean; disabled?: boolean; loading?: boolean };
    onOk?: () => unknown;
    onCancel?: () => void;
    /** 面板始终居中；保留该 prop 与 antd 同签名 */
    centered?: boolean;
    width?: number | string;
}

export interface ModalInstance {
    confirm: (props: ModalFuncProps) => void;
    info: (props: ModalFuncProps) => void;
    warning: (props: ModalFuncProps) => void;
}

interface AppContextValue {
    message: MessageInstance;
    modal: ModalInstance;
}

/** 无 provider 时的 no-op 实例：与 antd 一致，脱离 Provider 渲染不抛错（测试、独立预览页会走到这里） */
const NOOP_MESSAGE_TYPE: MessageType = Object.assign(() => {}, { then: Promise.resolve(true).then.bind(Promise.resolve(true)) }) as MessageType;
const NOOP: AppContextValue = {
    message: {
        success: () => NOOP_MESSAGE_TYPE,
        error: () => NOOP_MESSAGE_TYPE,
        warning: () => NOOP_MESSAGE_TYPE,
        info: () => NOOP_MESSAGE_TYPE,
        loading: () => NOOP_MESSAGE_TYPE,
        open: () => NOOP_MESSAGE_TYPE,
        destroy: () => {},
    },
    modal: { confirm: () => {}, info: () => {}, warning: () => {} },
};

const AppContext = createContext<AppContextValue>(NOOP);

const TOAST_DURATION_MS = 2400;
const MAX_TOASTS = 3;

/**
 * 静态 message 的落地实例。antd 的静态 message 不依赖 React context，
 * 这里由 GammaAntAppProvider 挂载时注册；注册前调用先排队，避免首屏调用丢失。
 */
let liveMessage: MessageInstance | null = null;
const pending: Array<(instance: MessageInstance) => void> = [];

/** 静态调用：已注册就直接执行，未注册则排队；返回 antd 兼容的 MessageType */
function staticCall(run: (instance: MessageInstance) => MessageType): MessageType {
    let closed: (() => void) | undefined;
    const close = () => closed?.();
    let resolveClosed: (value: boolean) => void = () => {};
    const settled = new Promise<boolean>((resolve) => {
        resolveClosed = resolve;
    });
    const runAndTrack = (instance: MessageInstance) => {
        const type = run(instance);
        closed = () => {
            type();
            resolveClosed(true);
        };
    };
    if (liveMessage) runAndTrack(liveMessage);
    else pending.push(runAndTrack);
    return Object.assign(close, { then: settled.then.bind(settled) }) as MessageType;
}

/** 非画布页面的 App 上下文；画布仍用 antd 的 App，两者可同时存在 */
export function GammaAntAppProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<GammaToastItem[]>([]);
    const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
    const keyed = useRef(new Map<string | number, number>());
    const seq = useRef(0);

    const dismiss = useCallback((id: number) => {
        setToasts((current) => current.filter((toast) => toast.id !== id));
        const timer = timers.current.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.current.delete(id);
        }
    }, []);

    const push = useCallback(
        (tone: GammaToastTone, arg: MessageArg, durationOverride?: number): MessageType => {
            const config: MessageConfig = isConfig(arg) ? arg : { content: arg };
            const duration = config.duration ?? durationOverride ?? TOAST_DURATION_MS;
            const replacedId = config.key !== undefined ? keyed.current.get(config.key) : undefined;
            const id = replacedId ?? ++seq.current;
            const toast: GammaToastItem = { id, tone, message: config.content };

            setToasts((current) => {
                const existing = current.some((item) => item.id === id);
                const next = existing ? current.map((item) => (item.id === id ? toast : item)) : [...current, toast];
                return next.slice(-MAX_TOASTS);
            });

            if (config.key !== undefined) keyed.current.set(config.key, id);
            const previous = timers.current.get(id);
            if (previous) clearTimeout(previous);

            // 与 antd MessageType 对齐：可直接调用关闭，也可 await 关闭
            let resolveClosed: (value: boolean) => void = () => {};
            const closed = new Promise<boolean>((resolve) => {
                resolveClosed = resolve;
            });
            const close = () => {
                dismiss(id);
                resolveClosed(true);
            };
            if (duration > 0) timers.current.set(id, setTimeout(close, duration));
            return Object.assign(close, { then: closed.then.bind(closed) }) as MessageType;
        },
        [dismiss],
    );

    useEffect(
        () => () => {
            timers.current.forEach((timer) => clearTimeout(timer));
            timers.current.clear();
        },
        [],
    );

    const message = useMemo<MessageInstance>(() => {
        const make = (tone: GammaToastTone) => (arg: MessageArg, duration?: number) => push(tone, arg, duration);
        return {
            success: make("success"),
            error: make("error"),
            warning: make("warning"),
            info: make("info"),
            loading: (arg, duration) => push("info", arg, duration ?? 0),
            open: (args) => push("info", args),
            destroy: (key) => {
                if (key === undefined) {
                    setToasts([]);
                    return;
                }
                const id = keyed.current.get(key);
                if (id !== undefined) {
                    keyed.current.delete(key);
                    dismiss(id);
                }
            },
        };
    }, [dismiss, push]);

    const [dialog, setDialog] = useState<(ModalFuncProps & { tone: "confirm" | "info" | "warning" }) | null>(null);
    const [running, setRunning] = useState(false);

    const modal = useMemo<ModalInstance>(() => {
        const open = (tone: "confirm" | "info" | "warning") => (props: ModalFuncProps) => setDialog({ ...props, tone });
        return { confirm: open("confirm"), info: open("info"), warning: open("warning") };
    }, []);

    const closeDialog = () => {
        dialog?.onCancel?.();
        setDialog(null);
    };

    const acceptDialog = async () => {
        if (!dialog) return;
        setRunning(true);
        try {
            await dialog.onOk?.();
        } finally {
            setRunning(false);
            setDialog(null);
        }
    };

    // 注册静态 message 实例，并清空挂载前排队的调用
    useEffect(() => {
        liveMessage = message;
        while (pending.length) pending.shift()?.(message);
        return () => {
            if (liveMessage === message) liveMessage = null;
        };
    }, [message]);

    const value = useMemo(() => ({ message, modal }), [message, modal]);
    const Icon = dialog?.tone === "info" ? Info : AlertTriangle;

    return (
        <AppContext.Provider value={value}>
            {children}
            <GammaToastStack toasts={toasts} onDismiss={dismiss} />
            {dialog ? (
                <GammaModal
                    open
                    title={typeof dialog.title === "string" ? dialog.title : ""}
                    onClose={closeDialog}
                    footer={
                        <>
                            <GammaButton variant="outline" onClick={closeDialog}>
                                {dialog.cancelText ?? "取消"}
                            </GammaButton>
                            <GammaButton variant={dialog.okButtonProps?.danger ? "danger" : "primary"} disabled={dialog.okButtonProps?.disabled} loading={running || dialog.okButtonProps?.loading} onClick={() => void acceptDialog()}>
                                {dialog.okText ?? "确定"}
                            </GammaButton>
                        </>
                    }
                >
                    <div className="flex gap-3 text-sm text-[var(--gm-text-2)]">
                        <Icon className={cn("mt-0.5 size-5 shrink-0", dialog.tone === "confirm" ? "text-[var(--gm-warning)]" : "text-[var(--gm-accent)]")} />
                        <div className="min-w-0">{dialog.title && typeof dialog.title !== "string" ? dialog.title : null}</div>
                        <div className="min-w-0">{dialog.content}</div>
                    </div>
                </GammaModal>
            ) : null}
        </AppContext.Provider>
    );
}

function useAppContext(): AppContextValue {
    return useContext(AppContext);
}

/** 与 antd App.useApp 同返回值：{ message, modal } */
function useApp() {
    return useAppContext();
}

/** 与 antd message.useMessage 同签名：[api, contextHolder]；contextHolder 由 provider 统一渲染，返回 null */
function useMessage(): [MessageInstance, ReactNode] {
    const { message: instance } = useAppContext();
    return [instance, null];
}

export const App = { useApp };

/** 与 antd 静态 message 同 API：success/error/warning/info/loading/open/destroy，外加 useMessage() */
export const message = {
    useMessage,
    success: (arg: MessageArg, duration?: number) => staticCall((instance) => instance.success(arg, duration)),
    error: (arg: MessageArg, duration?: number) => staticCall((instance) => instance.error(arg, duration)),
    warning: (arg: MessageArg, duration?: number) => staticCall((instance) => instance.warning(arg, duration)),
    info: (arg: MessageArg, duration?: number) => staticCall((instance) => instance.info(arg, duration)),
    loading: (arg: MessageArg, duration?: number) => staticCall((instance) => instance.loading(arg, duration)),
    open: (args: MessageConfig & { content: ReactNode }) => staticCall((instance) => instance.open(args)),
    destroy: (key?: string | number) =>
        staticCall((instance) => {
            instance.destroy(key);
            return Object.assign(() => {}, { then: Promise.resolve(true).then.bind(Promise.resolve(true)) }) as MessageType;
        }),
};
