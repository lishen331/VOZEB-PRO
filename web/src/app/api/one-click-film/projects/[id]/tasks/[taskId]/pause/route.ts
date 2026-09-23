import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { continueOneClickFilm, oneClickFilmTaskView, pauseOneClickFilm } from "@/lib/server/one-click-film/service";

/**
 * 对应 L 的 `pipelinePaused` 暂停 / 继续。
 *
 * L 里这是客户端标志位；V 的父任务由服务端 worker 推进，所以标志位必须落到任务上，
 * 否则用户关掉页面后 worker 仍会继续启动下一步。
 *
 * 语义与 L 一致：只挡住"启动下一步"，已提交的子任务照常跑完，不撤单、不退款、不重复扣费。
 *
 * POST .../tasks/:taskId/pause?action=pause|continue
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const { taskId } = await params;
    const action = new URL(request.url).searchParams.get("action")?.trim() || "pause";
    if (action !== "pause" && action !== "continue") return NextResponse.json({ code: 400, data: null, msg: "action 必须是 pause 或 continue" }, { status: 400 });
    const task = action === "pause" ? await pauseOneClickFilm(taskId, user.id) : await continueOneClickFilm(taskId, user.id);
    if (!task) return NextResponse.json({ code: 404, data: null, msg: "任务不存在" }, { status: 404 });
    return NextResponse.json({ code: 0, data: { task: oneClickFilmTaskView(task) }, msg: action === "pause" ? "已暂停，已提交的子任务会继续跑完" : "已继续" });
}
