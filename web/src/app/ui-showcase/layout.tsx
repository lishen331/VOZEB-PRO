import type { Metadata } from "next";
import type { ReactNode } from "react";

import "../styles/vozeb-ds/index.css";

export const metadata: Metadata = {
    title: "VOZEB Design System Preview",
    robots: { index: false, follow: false },
};

export default function UiShowcaseLayout({ children }: { children: ReactNode }) {
    return children;
}
