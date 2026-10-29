import type { Metadata } from "next";

import { GammaThemeProvider } from "@/components/gamma-ui/gamma-theme";
import { GammaDesignView } from "@/app/bluegamma/design/design-view";

export const metadata: Metadata = {
    title: "蓝色伽马 · 设计系统",
    robots: { index: false, follow: false },
};

/** 社区 · 设计系统：布鲁伽马全套组件与动效（可交互验收页） */
export default function BlueGammaDesignPage() {
    return (
        <GammaThemeProvider className="fixed inset-0 z-50 flex overflow-hidden">
            <GammaDesignView />
        </GammaThemeProvider>
    );
}
