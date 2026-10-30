"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MotionConfig } from "motion/react";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

import { ClientRootInit } from "@/components/layout/client-root-init";
import { GammaAntEmpty, gammaSpinIndicator } from "@/components/layout/gamma-ant-defaults";
import { GammaAntAppProvider } from "@/components/gamma-ui/gamma-ant-app";
import { getAntThemeConfig } from "@/lib/app-theme";
import { useThemeStore } from "@/stores/use-theme-store";

// The canvas editor (both /canvas/[id] and /drama-canvas/[id]) defaults to a
// dark theme independent of the site-wide theme — see useCanvasColorTheme in
// use-theme-store.ts. This regex is duplicated (not imported) in the inline
// bootstrap script in app/layout.tsx, which runs before hydration and cannot
// import app code.
const CANVAS_EDITOR_ROUTE = /^\/(?:canvas|drama-canvas)\/[^/]+/;

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 5 * 60_000,
            gcTime: 15 * 60_000,
            retry: false,
            refetchOnWindowFocus: false,
        },
    },
});

dayjs.locale("zh-cn");

export function AppProviders({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isCanvasEditorRoute = CANVAS_EDITOR_ROUTE.test(pathname || "");
    const globalTheme = useThemeStore((state) => state.theme);
    const canvasThemeOverride = useThemeStore((state) => state.canvasThemeOverride);
    const theme = isCanvasEditorRoute ? (canvasThemeOverride ?? "dark") : globalTheme;
    const dark = theme === "dark";

    useEffect(() => {
        const reloadOnceForChunkError = (reason: unknown) => {
            const text = reason instanceof Error ? `${reason.name} ${reason.message}` : String(reason);
            if (!/ChunkLoadError|Loading chunk|dynamically imported module|failed to fetch/i.test(text)) return;
            const key = "vozeb-pro:chunk-reload-attempted";
            const lastAttempt = Number(sessionStorage.getItem(key) || "0");
            if (Date.now() - lastAttempt < 30_000) return;
            sessionStorage.setItem(key, String(Date.now()));
            window.location.reload();
        };

        const handleError = (event: ErrorEvent) => reloadOnceForChunkError(event.error || event.message);
        const handleRejection = (event: PromiseRejectionEvent) => reloadOnceForChunkError(event.reason);
        window.addEventListener("error", handleError);
        window.addEventListener("unhandledrejection", handleRejection);
        return () => {
            window.removeEventListener("error", handleError);
            window.removeEventListener("unhandledrejection", handleRejection);
        };
    }, []);

    useLayoutEffect(() => {
        document.documentElement.classList.toggle("dark", dark);
        // 布鲁伽马换肤只挂在非画布编辑器路由；画布编辑器保持定稿 UI（同步 public/theme-bootstrap.js）
        document.documentElement.classList.toggle("gm-app", !isCanvasEditorRoute);
        document.documentElement.style.colorScheme = theme;
    }, [dark, isCanvasEditorRoute, theme]);

    return (
        <ConfigProvider
            locale={zhCN}
            theme={getAntThemeConfig(dark, { brand: !isCanvasEditorRoute })}
            // 布鲁伽马的空状态与加载圆环只给非画布页；画布编辑器保持 antd 默认
            renderEmpty={isCanvasEditorRoute ? undefined : () => <GammaAntEmpty />}
            spin={isCanvasEditorRoute ? undefined : { indicator: gammaSpinIndicator }}
        >
            <App message={{ top: 84, duration: 2.4, maxCount: 3 }}>
                {/* 非画布页面用 gamma-ui 的 message/modal；画布及其共享组件继续走上面 antd 的 App */}
                <GammaAntAppProvider>
                    <QueryClientProvider client={queryClient}>
                        {/* 系统开了「减少动态效果」时，非画布页的 motion 动画只保留透明度变化；画布编辑器本轮不动 */}
                        <MotionConfig reducedMotion={isCanvasEditorRoute ? "never" : "user"}>
                            <ClientRootInit>{children}</ClientRootInit>
                        </MotionConfig>
                    </QueryClientProvider>
                </GammaAntAppProvider>
            </App>
        </ConfigProvider>
    );
}
