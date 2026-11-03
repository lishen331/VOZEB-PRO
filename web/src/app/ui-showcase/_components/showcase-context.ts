"use client";

import type { MessageInstance } from "antd/es/message/interface";
import { createContext, useContext } from "react";

type ShowcaseContext = { getContainer: () => HTMLElement; toast: MessageInstance; dark: boolean };

export const ShowcaseCtx = createContext<ShowcaseContext | null>(null);

export function useShowcase() {
    const ctx = useContext(ShowcaseCtx);
    if (!ctx) throw new Error("useShowcase must be used inside ShowcaseClient");
    return ctx;
}
