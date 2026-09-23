import { redirect } from "next/navigation";
import { getAuthenticatedPageAccess } from "@/lib/server/page-access";
import OneClickFilmFeaturesClient from "./one-click-film-features-client";

export default async function OneClickFilmFeaturesPage() {
    const access = await getAuthenticatedPageAccess();
    if (!access.user) redirect("/login?next=/admin/one-click-film-features");
    if (access.user.role !== "admin") redirect("/");
    return <OneClickFilmFeaturesClient />;
}
