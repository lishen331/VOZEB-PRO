import { redirect } from "next/navigation";

import { loginHref, safeLoginNextPath } from "@/lib/login-navigation";
import { getInstallStatus } from "@/lib/server/install-status";

type RegisterPageProps = {
    searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
    const params = searchParams ? await searchParams : {};
    const nextPath = safeLoginNextPath(firstValue(params.next));
    const install = await getInstallStatus();
    if (!install.ready) redirect("/install");
    redirect(loginHref(nextPath));
}

function firstValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] : value;
}
