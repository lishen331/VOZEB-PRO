import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { getAuthSettings } from "@/lib/auth/store";
import ScriptPracticeWorkspace from "./script-practice-workspace";

export default async function PracticeScriptsPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    try {
        await requirePracticeAccess(user);
    } catch {
        redirect("/practice");
    }
    const settings = await getAuthSettings();
    if (settings.practiceScriptSettings.enabled === false) redirect("/practice");
    return <ScriptPracticeWorkspace />;
}
