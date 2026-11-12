import type { Metadata } from "next";
import type { ReactNode } from "react";

import "../styles/vz-lab/index.css";

export const metadata: Metadata = {
    title: "VOZEB Design Lab",
    robots: { index: false, follow: false },
};

export default function DesignLabLayout({ children }: { children: ReactNode }) {
    return children;
}
