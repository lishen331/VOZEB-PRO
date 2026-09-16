import { create } from "zustand";
import { persist } from "zustand/middleware";

import { appStorageKey } from "@/lib/storage-keys";

type ThemeName = "light" | "dark";

type ThemeStore = {
    theme: ThemeName;
    setTheme: (theme: ThemeName) => void;
    /** null = user has never manually picked a theme inside the canvas editor;
     *  the canvas then defaults to dark regardless of the site-wide `theme`. */
    canvasThemeOverride: ThemeName | null;
    setCanvasThemeOverride: (theme: ThemeName) => void;
};

const THEME_STORE_KEY = appStorageKey("theme_store");

export const useThemeStore = create<ThemeStore>()(
    persist(
        (set) => ({
            theme: "light",
            setTheme: (theme) => set({ theme }),
            canvasThemeOverride: null,
            setCanvasThemeOverride: (theme) => set({ canvasThemeOverride: theme }),
        }),
        { name: THEME_STORE_KEY },
    ),
);

/** Single read/write entry point for the canvas editor's own theme, kept
 *  independent of the site-wide `theme` so switching it never affects other
 *  pages, while still persisting the user's explicit in-canvas choice. */
export function useCanvasColorTheme() {
    const override = useThemeStore((state) => state.canvasThemeOverride);
    const setOverride = useThemeStore((state) => state.setCanvasThemeOverride);
    return { theme: override ?? "dark", setTheme: setOverride } as const;
}
