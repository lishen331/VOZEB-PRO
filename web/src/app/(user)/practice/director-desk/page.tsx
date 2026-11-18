import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";

import DirectorDeskEditor from "./director-desk-editor";

export default async function DirectorDeskPage() {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    // 3D 导演台不属于需要后台开关的 AI 单项练习，只校验练习访问权限。
    try {
        await requirePracticeAccess(user);
    } catch {
        notFound();
    }
    return (
        <main className="h-full min-h-0 overflow-hidden bg-[var(--gm-bg)]">
            <DirectorDeskEditor />
        </main>
    );
}
