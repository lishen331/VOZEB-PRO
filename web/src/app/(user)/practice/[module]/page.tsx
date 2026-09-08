import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getAuthSettings } from "@/lib/auth/store";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import type { PracticeModuleKind } from "@/lib/practice-domain";
import PracticeModuleWorkbench from "../components/practice-module-workbench";

const MODULES = ["character", "scene", "prop", "storyboard-image", "storyboard-video", "dubbing"] as const satisfies readonly PracticeModuleKind[];

export default async function PracticeModulePage({ params }: { params: Promise<{ module: string }> }) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    try {
        await requirePracticeAccess(user);
    } catch {
        notFound();
    }
    const moduleKind = (await params).module as PracticeModuleKind;
    if (!MODULES.includes(moduleKind as (typeof MODULES)[number])) notFound();
    const settings = await getAuthSettings();
    if (settings.practiceModuleVisibility?.[moduleKind as (typeof MODULES)[number]] === false) notFound();
    return <PracticeModuleWorkbench module={moduleKind} />;
}
