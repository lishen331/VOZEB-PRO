"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { useThemeStore } from "@/stores/use-theme-store";

const POSITION_KEY = "vozeb-pro:login_theme_pos";
const BUTTON_SIZE = 44;
const EDGE_MARGIN = 18;
/** 指针移动超过这个距离才算拖动，否则视为点击 */
const DRAG_THRESHOLD = 5;

type Position = { x: number; y: number };

function clampPosition(position: Position): Position {
    if (typeof window === "undefined") return position;
    const maxX = Math.max(EDGE_MARGIN, window.innerWidth - BUTTON_SIZE - EDGE_MARGIN);
    const maxY = Math.max(EDGE_MARGIN, window.innerHeight - BUTTON_SIZE - EDGE_MARGIN);
    return {
        x: Math.min(Math.max(position.x, EDGE_MARGIN), maxX),
        y: Math.min(Math.max(position.y, EDGE_MARGIN), maxY),
    };
}

function defaultPosition(): Position {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    return {
        x: window.innerWidth - BUTTON_SIZE - Math.round(window.innerWidth * 0.037),
        y: Math.round(window.innerHeight * 0.03),
    };
}

/** 登录页专用的明暗切换：可拖动，位置记在本机，主题与登录后共用同一个存储键。 */
export function LoginThemeToggle() {
    const theme = useThemeStore((state) => state.theme);
    const setTheme = useThemeStore((state) => state.setTheme);
    const [position, setPosition] = useState<Position | null>(null);
    const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);

    useEffect(() => {
        let saved: Position | null = null;
        try {
            const raw = localStorage.getItem(POSITION_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as Partial<Position>;
                if (typeof parsed.x === "number" && typeof parsed.y === "number") saved = { x: parsed.x, y: parsed.y };
            }
        } catch {
            saved = null;
        }
        setPosition(clampPosition(saved ?? defaultPosition()));
    }, []);

    // 窗口尺寸变化时把按钮拉回可视区域
    useEffect(() => {
        if (!position) return;
        const onResize = () => setPosition((current) => (current ? clampPosition(current) : current));
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [position === null]);

    const persist = useCallback((next: Position) => {
        try {
            localStorage.setItem(POSITION_KEY, JSON.stringify(next));
        } catch {
            /* 隐私模式写不进去，忽略 */
        }
    }, []);

    const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (!position) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            originX: position.x,
            originY: position.y,
            moved: false,
        };
    };

    const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        const dx = event.clientX - drag.startX;
        const dy = event.clientY - drag.startY;
        if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
        drag.moved = true;
        setPosition(clampPosition({ x: drag.originX + dx, y: drag.originY + dy }));
    };

    const onPointerUp = (event: React.PointerEvent<HTMLButtonElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        if (drag.moved) {
            setPosition((current) => {
                if (current) persist(current);
                return current;
            });
            return;
        }
        // 没拖动就是点击：切换主题，与登录后共用同一份设置
        setTheme(theme === "dark" ? "light" : "dark");
    };

    const isDark = theme === "dark";

    return (
        <button
            type="button"
            className="auth-education-theme-toggle"
            aria-label={isDark ? "切换到亮色主题" : "切换到暗色主题"}
            title={isDark ? "切换到亮色主题" : "切换到暗色主题"}
            style={position ? { left: position.x, top: position.y } : { opacity: 0 }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
        >
            <Sun className="auth-education-theme-icon auth-education-theme-icon-sun" aria-hidden="true" />
            <Moon className="auth-education-theme-icon auth-education-theme-icon-moon" aria-hidden="true" />
        </button>
    );
}
