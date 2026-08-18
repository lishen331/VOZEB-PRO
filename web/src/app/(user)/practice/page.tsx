import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import PracticeHome from "./components/practice-home";

export default async function PracticePage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    try {
        await requirePracticeAccess(user);
    } catch {
        redirect("/create");
    }
    return <PracticeHome />;
}
