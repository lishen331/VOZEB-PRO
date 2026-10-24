"use client";

import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Moon, Sun, Type } from "lucide-react";

import { GammaIconButton } from "@/components/gamma-ui/gamma-button";
import { GammaMenu } from "@/components/gamma-ui/gamma-overlays";
import { GAMMA_DEFAULT_FONT_ID, GAMMA_FONT_OPTIONS, GAMMA_MONO_FAMILY, gammaFontById, loadGammaFontSheets } from "@/components/gamma-ui/gamma-fonts";
import { cn } from "@/lib/utils";

export type GammaThemeMode = "dark" | "light";

/* 预览页用 localStorage 记住主题与字体，不落后端设置 */
const THEME_KEY = "bluegamma:preview-theme";
const FONT_KEY = "bluegamma:preview-font";
const TRANSITION_MS = 400;

interface GammaThemeValue {
    mode: GammaThemeMode;
    setMode: (mode: GammaThemeMode) => void;
    toggleMode: () => void;
    fontId: string;
    setFontId: (id: string) => void;
}

const GammaThemeContext = createContext<GammaThemeValue | null>(null);

export function useGammaTheme() {
    const value = useContext(GammaThemeContext);
    if (!value) throw new Error("useGammaTheme 必须在 GammaThemeProvider 内使用");
    return value;
}

function readStored(key: string) {
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStored(key: string, value: string) {
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // 隐私模式下写入失败不影响当前页面
    }
}

/**
 * 主题与字体容器：输出 .gm / .gm-light 作用域类，并把选中字体写进 CSS 变量。
 * 首帧用默认值（浅色 + MiSans，对齐线上主站形象），挂载后再读 localStorage，避免 SSR 不一致。
 */
export function GammaThemeProvider({ children, className }: { children: ReactNode; className?: string }) {
    const [mode, setModeState] = useState<GammaThemeMode>("light");
    const [fontId, setFontIdState] = useState(GAMMA_DEFAULT_FONT_ID);
    const [transitioning, setTransitioning] = useState(false);
    const timerRef = useRef<number | undefined>(undefined);

    useEffect(() => {
        const storedTheme = readStored(THEME_KEY);
        const storedFont = readStored(FONT_KEY);
        // 挂载后同步一次本地偏好（外部存储 → React 状态）
        if (storedTheme === "light" || storedTheme === "dark") setModeState(storedTheme);
        if (storedFont) setFontIdState(gammaFontById(storedFont).id);
        return () => window.clearTimeout(timerRef.current);
    }, []);

    const font = gammaFontById(fontId);

    useEffect(() => {
        loadGammaFontSheets(font);
    }, [font]);

    const setMode = useCallback((next: GammaThemeMode) => {
        setModeState(next);
        writeStored(THEME_KEY, next);
        setTransitioning(true);
        window.clearTimeout(timerRef.current);
        timerRef.current = window.setTimeout(() => setTransitioning(false), TRANSITION_MS);
    }, []);

    const setFontId = useCallback((id: string) => {
        const resolved = gammaFontById(id);
        setFontIdState(resolved.id);
        writeStored(FONT_KEY, resolved.id);
    }, []);

    const value = useMemo<GammaThemeValue>(() => ({ mode, setMode, toggleMode: () => setMode(mode === "dark" ? "light" : "dark"), fontId: font.id, setFontId }), [font.id, mode, setFontId, setMode]);

    return (
        <GammaThemeContext.Provider value={value}>
            <div
                data-theme={mode}
                className={cn("gm", mode === "light" && "gm-light", transitioning && "gm-theme-transition", className)}
                style={{ ["--gm-font-sans" as string]: font.body, ["--gm-font-display" as string]: font.display, ["--gm-font-mono" as string]: GAMMA_MONO_FAMILY }}
            >
                {children}
            </div>
        </GammaThemeContext.Provider>
    );
}

/** 主题切换按钮：日月图标交叉旋转淡入 */
export function GammaThemeToggle() {
    const { mode, toggleMode } = useGammaTheme();
    const dark = mode === "dark";
    return (
        <GammaIconButton label={dark ? "切换到白色主题" : "切换到黑夜主题"} onClick={toggleMode}>
            <span className="relative grid size-[18px] place-items-center">
                <Sun className={cn("absolute size-[18px] transition-all duration-300", dark ? "scale-50 rotate-90 opacity-0" : "scale-100 rotate-0 opacity-100")} />
                <Moon className={cn("absolute size-[18px] transition-all duration-300", dark ? "scale-100 rotate-0 opacity-100" : "scale-50 -rotate-90 opacity-0")} />
            </span>
        </GammaIconButton>
    );
}

/** 字体切换菜单 */
export function GammaFontSwitcher() {
    const { fontId, setFontId } = useGammaTheme();
    return (
        <GammaMenu
            label="切换字体"
            trigger={(open) => (
                <span
                    className={cn(
                        "grid size-9 place-items-center rounded-[var(--gm-radius-sm)] transition-colors",
                        open ? "bg-[var(--gm-accent-soft)] text-[var(--gm-accent)]" : "text-[var(--gm-text-2)] hover:bg-[var(--gm-wash-strong)] hover:text-[var(--gm-text)]",
                    )}
                >
                    <Type className="size-[18px]" />
                </span>
            )}
            items={GAMMA_FONT_OPTIONS.map((option) => ({
                key: option.id,
                label: `${option.name}${option.id === fontId ? "  ✓" : ""}`,
                onSelect: () => setFontId(option.id),
            }))}
        />
    );
}
