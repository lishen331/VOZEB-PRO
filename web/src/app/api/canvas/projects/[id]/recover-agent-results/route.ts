import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { recoverCanvasProjectForUser } from "@/lib/server/canvas-agent-recovery-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Explicit mutation on project entry: no generation or new upstream calls. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const project = await recoverCanvasProjectForUser(user.id, (await params).id);
    if (!project) return NextResponse.json({ code: 404, data: null, msg: "画布项目不存在" }, { status: 404 });
    return NextResponse.json({ code: 0, data: { project }, msg: "画布任务结果已同步" });
}
