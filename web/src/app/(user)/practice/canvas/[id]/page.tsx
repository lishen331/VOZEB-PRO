import { notFound, redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { getCanvasProjectForUser } from "@/lib/server/canvas-project-service";
import PracticeCanvasClientPage from "./practice-canvas-client-page";

/**
 * 练习画布入口。只放行 execution_profile 为练习的项目；正式项目、无练习权限、
 * 不存在的项目一律 404，避免练习路由打开正式画布。
 */
export default async function PracticeCanvasPage({ params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) redirect("/login");
    const { id } = await params;
    let project: Awaited<ReturnType<typeof getCanvasProjectForUser>> | null = null;
    try {
        project = await getCanvasProjectForUser(user.id, id);
    } catch {
        notFound();
    }
    if ((project as { executionProfile?: string } | null)?.executionProfile !== "open-source-practice") notFound();
    return <PracticeCanvasClientPage />;
}
