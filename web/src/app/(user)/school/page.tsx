import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { requireSchoolManager } from "@/lib/server/school-access-service";
import { SchoolAdministration } from "./school-administration";

export default async function SchoolPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    try {
        await requireSchoolManager(user.id);
    } catch {
        redirect("/create");
    }
    return <SchoolAdministration />;
}
