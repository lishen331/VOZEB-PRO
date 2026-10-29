/**
 * gamma-ui 控件尺寸刻度：唯一真源。
 *
 * 三档与设计页 GammaButton（gamma-button.tsx 的 SIZE）的 xs / sm / md 逐项一致：
 *   28px / 32px / 40px
 *
 * 兼容层（Button / Input / Select / Segmented）都从这里取高度、圆角、字号、间距，
 * 不再各写一份。此前四份表互相漂移：small 档在 Button/Input 是 24px、在 Select 是 28px，
 * 圆角还用了 antd 遗留的 7px —— 同一个 size="small" 在不同控件上不是同一个尺寸。
 *
 * antd 只有 small / middle / large 三档，按 xs / sm / md 映射。
 */
export type ControlSize = "small" | "middle" | "large";

export interface ControlTier {
    /** 固定高度（按钮、分段项） */
    height: "h-7" | "h-8" | "h-10";
    /** 最小高度（输入框、下拉触发器，允许内容撑高） */
    minHeight: "min-h-7" | "min-h-8" | "min-h-10";
    /** 正方形尺寸（纯图标按钮） */
    square: "size-7" | "size-8" | "size-10";
    gap: "gap-1" | "gap-1.5" | "gap-2";
    radius: string;
    text: "text-xs" | "text-[13px]" | "text-sm";
}

export const CONTROL_TIER: Record<ControlSize, ControlTier> = {
    small: {
        height: "h-7",
        minHeight: "min-h-7",
        square: "size-7",
        gap: "gap-1",
        radius: "rounded-[var(--gm-radius-sm)]",
        text: "text-xs",
    },
    middle: {
        height: "h-8",
        minHeight: "min-h-8",
        square: "size-8",
        gap: "gap-1.5",
        radius: "rounded-[var(--gm-radius-sm)]",
        text: "text-[13px]",
    },
    large: {
        height: "h-10",
        minHeight: "min-h-10",
        square: "size-10",
        gap: "gap-2",
        radius: "rounded-[var(--gm-radius)]",
        text: "text-sm",
    },
};

/** 按钮：高度 + 间距 + 圆角 + 左右内边距 + 字号 */
export function controlBox(size: ControlSize, paddingX: string): string {
    const tier = CONTROL_TIER[size];
    return `${tier.height} ${tier.gap} ${tier.radius} ${paddingX} ${tier.text}`;
}

/** 纯图标按钮：正方形 + 圆角 */
export function controlSquare(size: ControlSize): string {
    const tier = CONTROL_TIER[size];
    return `${tier.square} ${tier.radius}`;
}

/** 输入类外框：最小高度 + 圆角 + 左右内边距 + 字号 */
export function controlShell(size: ControlSize, paddingX: string): string {
    const tier = CONTROL_TIER[size];
    return `${tier.minHeight} ${tier.radius} ${paddingX} ${tier.text}`;
}

/** 分段项等行内块：高度 + 左右内边距 + 字号 */
export function controlItem(size: ControlSize, paddingX: string): string {
    const tier = CONTROL_TIER[size];
    return `${tier.height} ${paddingX} ${tier.text}`;
}
