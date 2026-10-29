import type { Metadata } from "next";

import { GammaThemeProvider } from "@/components/gamma-ui/gamma-theme";
import { GammaHomeView } from "@/app/bluegamma/home-view";

export const metadata: Metadata = {
    title: "蓝色伽马 BlueGamma · 新版首页预览",
    robots: { index: false, follow: false },
};

/** 布鲁伽马改版首页预览（本地模拟数据，验收后再接入真实接口） */
export default function BlueGammaHomePage() {
    return (
        <GammaThemeProvider className="fixed inset-0 z-50 flex flex-col overflow-hidden">
            <GammaHomeView />
        </GammaThemeProvider>
    );
}
