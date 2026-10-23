import type { Metadata } from "next";

import { PromptsView } from "@/app/bluegamma/prompts/prompts-view";

export const metadata: Metadata = {
    title: "布鲁伽马 BlueGamma · 提示词库",
};

export default function Page() {
    return <PromptsView />;
}
