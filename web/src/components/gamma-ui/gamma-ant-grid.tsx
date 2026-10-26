"use client";

/*
 * gamma-ui 的 antd Grid.useBreakpoint 兼容层。用 window.resize 监听标准断点，
 * 返回形状与 antd 一致的 { xs, sm, md, lg, xl, xxl } 布尔对象。
 * 断点阈值与 antd 默认主题一致：sm>=576 md>=768 lg>=992 xl>=1200 xxl>=1600。
 * 站内只用到 lg/md/sm，但保留全部字段以保持调用处类型不变。
 * 画布不使用本文件。
 */

import { useEffect, useState } from "react";

export const BREAKPOINTS = { xs: 0, sm: 576, md: 768, lg: 992, xl: 1200, xxl: 1600 } as const;

type Screens = { xs: boolean; sm: boolean; md: boolean; lg: boolean; xl: boolean; xxl: boolean };

export function computeScreens(width: number): Screens {
    return { xs: width >= BREAKPOINTS.xs, sm: width >= BREAKPOINTS.sm, md: width >= BREAKPOINTS.md, lg: width >= BREAKPOINTS.lg, xl: width >= BREAKPOINTS.xl, xxl: width >= BREAKPOINTS.xxl };
}

/** SSR 阶段没有 window，先按「全部不命中」渲染，水合后按真实宽度更新 */
const INITIAL_SCREENS: Screens = { xs: false, sm: false, md: false, lg: false, xl: false, xxl: false };

function useBreakpoint(): Screens {
    const [screens, setScreens] = useState<Screens>(INITIAL_SCREENS);

    useEffect(() => {
        const update = () => setScreens(computeScreens(window.innerWidth));
        update();
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
    }, []);

    return screens;
}

export const Grid = { useBreakpoint };
