import { redirect } from "next/navigation";
import { getAuthenticatedPageAccess } from "@/lib/server/page-access";
import DramaLabFeaturesClient from "./drama-lab-features-client";

export default async function DramaLabFeaturesPage() {
    const access = await getAuthenticatedPageAccess();
    if (!access.user) redirect("/login?next=/admin/drama-lab-features");
    if (access.user.role !== "admin") redirect("/");
    return <DramaLabFeaturesClient />;
}
