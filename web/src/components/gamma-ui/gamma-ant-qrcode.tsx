"use client";

/*
 * gamma-ui 的 antd QRCode 兼容层。用 `qrcode` 包的同步 create() 取模块位图，
 * 自己画成内联 SVG（不依赖 antd 内部的 @rc-component/qrcode，也不用它的异步 toString）。
 * props 与 antd 同名同义，只实现站内实际用到的子集：value/size/type/className/bordered。
 * 画布不使用本文件。
 */

import { create as createQrMatrix } from "qrcode";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

export interface QRCodeProps {
    value: string;
    size?: number;
    /** antd 区分 canvas/svg 渲染器；本兼容层始终画 SVG，这里只接收以保持调用处不变 */
    type?: "canvas" | "svg";
    className?: string;
    /** 默认 true：外层加一圈白底 + 浅描边，与 antd 默认视觉一致 */
    bordered?: boolean;
}

export function QRCode({ value, size = 160, className, bordered = true }: QRCodeProps) {
    const modules = useMemo(() => createQrMatrix(value).modules, [value]);
    const cellCount = modules.size;

    return (
        <div className={cn("ant-qrcode inline-block", bordered && "rounded-md border border-[var(--gm-border)] bg-white p-3", className)}>
            <svg viewBox={`0 0 ${cellCount} ${cellCount}`} width={size} height={size} shapeRendering="crispEdges" role="img" aria-label="二维码">
                <rect width={cellCount} height={cellCount} fill="#fff" />
                {Array.from({ length: cellCount * cellCount }, (_, index) => {
                    const row = Math.floor(index / cellCount);
                    const col = index % cellCount;
                    return modules.get(row, col) ? <rect key={index} x={col} y={row} width={1} height={1} fill="#000" /> : null;
                })}
            </svg>
        </div>
    );
}
