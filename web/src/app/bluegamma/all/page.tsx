import type { Metadata } from "next";

import { AllView } from "@/app/bluegamma/all/all-view";

export const metadata: Metadata = {
    title: "布鲁伽马 BlueGamma · 全部",
};

export default function Page() {
    return <AllView />;
}
