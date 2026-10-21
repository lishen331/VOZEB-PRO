import type { Metadata } from "next";

import { GammaThemeProvider } from "@/components/gamma-ui/gamma-theme";
import { PracticeView } from "@/app/bluegamma/practice/practice-view";

export const metadata: Metadata = {
    title: "布鲁伽马 BlueGamma · 无限练习",
    robots: { index: false, follow: false },
};

/** 无限练习设计稿（本地模拟数据，不调接口）。对照线上 /practice 重做，组件全部换成 gamma-ui */
export default function BlueGammaPracticePage() {
    return (
        <GammaThemeProvider className="fixed inset-0 z-50 flex flex-col overflow-hidden">
            <PracticeView />
        </GammaThemeProvider>
    );
}
