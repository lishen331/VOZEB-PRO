import type { Metadata } from "next";

import { AssetsView } from "@/app/bluegamma/assets/assets-view";

export const metadata: Metadata = {
    title: "布鲁伽马 BlueGamma · 我的素材",
};

export default function Page() {
    return <AssetsView />;
}
