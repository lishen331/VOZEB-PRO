import type { Metadata } from "next";

import { StudiosView } from "@/app/bluegamma/studios/studios-view";

export const metadata: Metadata = {
    title: "布鲁伽马 BlueGamma · 工作室",
};

export default function Page() {
    return <StudiosView />;
}
