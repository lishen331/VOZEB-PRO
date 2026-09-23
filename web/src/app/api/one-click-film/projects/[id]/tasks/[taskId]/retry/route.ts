import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { retryOneClickFilm, oneClickFilmTaskView } from "@/lib/server/one-click-film/service";
export async function POST(_r: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    const { taskId } = await params;
    const task = await retryOneClickFilm(taskId, user.id);
    return task ? NextResponse.json({ code: 0, data: { task: oneClickFilmTaskView(task) }, msg: "OK" }) : NextResponse.json({ code: 404, msg: "任务不存在" }, { status: 404 });
}
