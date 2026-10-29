import type { Metadata } from "next";

import { GammaThemeProvider } from "@/components/gamma-ui/gamma-theme";
import { KlingHomeView } from "@/app/bluegamma/home/kling-home-view";

export const metadata: Metadata = {
    title: "蓝色伽马 BlueGamma · 首页（可灵版式）",
    robots: { index: false, follow: false },
};

/** 按可灵 /app 版式排布的首页，工具行替换为 12 个专业方向（本地模拟数据） */
export default function BlueGammaKlingHomePage() {
    return (
        <GammaThemeProvider className="fixed inset-0 z-50 flex flex-col overflow-hidden">
            <KlingHomeView />
        </GammaThemeProvider>
    );
}
