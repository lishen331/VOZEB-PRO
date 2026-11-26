import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import OutpaintingWorkbench from "./workbench";

export default async function OutpaintingPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    try {
        await requirePracticeAccess(user);
    } catch {
        notFound();
    }
    return <OutpaintingWorkbench />;
}
