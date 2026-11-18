import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import type { PracticeImageToolId } from "@/lib/practice-image-tools";
import PracticeImageToolWorkbench from "./practice-image-tool-workbench";

export async function PracticeImageToolPage({ toolId }: { toolId: PracticeImageToolId }) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    try {
        await requirePracticeAccess(user);
    } catch {
        notFound();
    }
    return (
        <main className="h-full min-h-0 overflow-hidden bg-[var(--gm-bg)]">
            <PracticeImageToolWorkbench toolId={toolId} />
        </main>
    );
}
