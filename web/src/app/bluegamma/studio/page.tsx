import type { Metadata } from "next";

import { StudioView } from "@/app/bluegamma/studio/studio-view";

export const metadata: Metadata = {
    title: "布鲁伽马 BlueGamma · 工作台",
    robots: { index: false, follow: false },
};

/** 工作台设计稿（本地模拟数据，不调接口）：左参数面板 + 中画面 + 右历史 */
export default function BlueGammaStudioPage() {
    return <StudioView />;
}
