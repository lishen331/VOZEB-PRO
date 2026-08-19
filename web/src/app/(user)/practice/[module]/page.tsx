import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import type { PracticeModuleKind } from "@/lib/practice-domain";
import PracticeModuleWorkbench from "../components/practice-module-workbench";

const MODULES: PracticeModuleKind[] = ["script", "storyboard-image", "storyboard-video", "dubbing", "music"];

export default async function PracticeModulePage({ params }: { params: Promise<{ module: string }> }) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    try {
        await requirePracticeAccess(user);
    } catch {
        notFound();
    }
    const moduleKind = (await params).module as PracticeModuleKind;
    if (!MODULES.includes(moduleKind)) notFound();
    return <PracticeModuleWorkbench module={moduleKind} />;
}
