"use client";

import { create } from "zustand";

import type { SchoolContext } from "@/lib/school-domain";

type SchoolContextState = {
    context: SchoolContext | null;
    setContext: (context: SchoolContext | null) => void;
};

export const useSchoolContextStore = create<SchoolContextState>((set) => ({
    context: null,
    setContext: (context) => set({ context }),
}));
