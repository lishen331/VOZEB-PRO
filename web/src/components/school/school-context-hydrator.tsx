"use client";

import { useEffect, type ReactNode } from "react";

import type { SchoolContext } from "@/lib/school-domain";
import { useSchoolContextStore } from "@/stores/use-school-context-store";

export function SchoolContextHydrator({ context, children }: { context: SchoolContext | null; children: ReactNode }) {
    const setContext = useSchoolContextStore((state) => state.setContext);

    useEffect(() => {
        setContext(context);
        return () => setContext(null);
    }, [context, setContext]);

    return <>{children}</>;
}
