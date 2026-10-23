import type { Metadata } from "next";

import { ScriptsView } from "@/app/bluegamma/practice/scripts/scripts-view";

export const metadata: Metadata = {
    title: "布鲁伽马 BlueGamma · 剧本练习",
};

export default function Page() {
    return <ScriptsView />;
}
