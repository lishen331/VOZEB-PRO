"use client";

import type { ReactNode } from "react";
import { useEffect, useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App, ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import dayjs from "dayjs";
import "dayjs/locale/zh-cn";

import { ClientRootInit } from "@/components/layout/client-root-init";
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
        <ConfigProvider locale={zhCN} theme={getAntThemeConfig(dark, { brand: !isCanvasEditorRoute })}>
            <App message={{ top: 84, duration: 2.4, maxCount: 3 }}>
                <QueryClientProvider client={queryClient}>
                    <ClientRootInit>{children}</ClientRootInit>
                </QueryClientProvider>
            </App>
        </ConfigProvider>
    );
}
