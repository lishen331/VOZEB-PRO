import { Suspense } from "react";
import type { Metadata } from "next";

import { GammaThemeProvider } from "@/components/gamma-ui/gamma-theme";
import { FlowView } from "@/app/bluegamma/flow/flow-view";

export const metadata: Metadata = {
    title: "蓝色伽马 BlueGamma · 专业创作画布",
    robots: { index: false, follow: false },
};

/** 专业引导式画布（本地模拟数据，不调接口）。?major= 选专业，默认室内设计 */
export default function BlueGammaFlowPage() {
    return (
        <GammaThemeProvider className="fixed inset-0 z-50 flex flex-col overflow-hidden">
            <Suspense>
                <FlowView />
            </Suspense>
        </GammaThemeProvider>
    );
}
