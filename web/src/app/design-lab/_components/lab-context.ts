"use client";

import type { MessageInstance } from "antd/es/message/interface";
import { createContext, useContext } from "react";

export const LabCtx = createContext<{ getContainer: () => HTMLElement; toast: MessageInstance } | null>(null);

export function useLab() {
    const ctx = useContext(LabCtx);
    if (!ctx) throw new Error("useLab must be used inside LabClient");
    return ctx;
}
