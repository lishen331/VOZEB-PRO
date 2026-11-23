import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";

import MultiAngleWorkbench from "./multi-angle-workbench";

export default async function MultiAnglePage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");

    // 多角度练习同样是不需要后台开关的本地工具，只校验练习访问权限。
    try {
        await requirePracticeAccess(user);
    } catch {
        notFound();
    }

    return (
        <main className="h-full min-h-0 overflow-hidden bg-[var(--gm-bg)]">
            <MultiAngleWorkbench />
        </main>
    );
}
