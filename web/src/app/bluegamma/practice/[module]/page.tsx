import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { practiceModuleMeta } from "@/app/bluegamma/practice/practice-modules";
import { ModuleWorkbenchView } from "@/app/bluegamma/practice/[module]/module-workbench-view";

export async function generateMetadata({ params }: { params: Promise<{ module: string }> }): Promise<Metadata> {
    const { module } = await params;
    const meta = practiceModuleMeta(module);
    return { title: meta ? `布鲁伽马 BlueGamma · ${meta.title}练习` : "布鲁伽马 BlueGamma · 无限练习" };
}

export default async function Page({ params }: { params: Promise<{ module: string }> }) {
    const { module } = await params;
    const meta = practiceModuleMeta(module);
    if (!meta) notFound();
    return <ModuleWorkbenchView module={meta.module} />;
}
