import { NextResponse } from "next/server";

import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { DramaLabStoryboardOptionsError, normalizeDramaLabStoryboardOptions } from "@/lib/drama-lab-storyboard-options";
import { advanceDramaLabWorkflow, dramaLabWorkflowTaskView, startDramaLabWorkflow } from "@/lib/server/drama-lab-workflow-task-service";
import { getDramaProjectForUser } from "@/lib/server/drama-project-service";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;

/**
 * 单集分镜拆解，对应 L `GET /storyboards/episode/:episode_id/generate`
 * （episodeStoryboardService.generateStoryboard）。
 *
 * 为什么需要它：V 此前只能通过 `POST /tasks` 跑完整的 7 步工作流（script→assets→
 * storyboard→images→videos→audio→compose），`currentStepIndex` 恒从 0 开始，
 * 没有"只重拆这一集分镜"的入口。而 L 允许单独重跑分镜拆解，这是改剧本后最常用的操作。
 *
 * 实现上复用 executor 的同一个子工作流（mode=storyboard_extract、scope=current），
 * 因此提示词契约、落库字段与整条链路完全一致，不是另写一套拆解逻辑。
 * 用 POST 而不是 L 的 GET：这是有副作用的写操作，GET 会被浏览器与代理预取。
 *
 * 拆解参数（分镜数量 / 视频总时长 / 全能模式 / 解说旁白）与 L 的 §4 配置行对应，
 * 经 `normalizeDramaLabStoryboardOptions` 校验后进入 `storyboardOptions`，
 * 最终由工作流交给拆解服务注入提示词约束 —— 不是前端摆着不生效的控件。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; episodeId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, episodeId } = await params;
        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) return NextResponse.json({ code: 404, data: null, msg: "一键成片项目不存在" }, { status: 404 });

        const episode = project.episodes.find((item) => item.id === episodeId);
        if (!episode) return NextResponse.json({ code: 404, data: null, msg: "当前剧集不存在" }, { status: 404 });
        // L 在剧本为空时报错而不是产出空分镜，这里保持一致。
        if (!episode.script.trim()) return NextResponse.json({ code: 400, data: null, msg: "剧本内容为空" }, { status: 400 });

        // 拆解参数可选：不传就沿用 AI 自行决定，与 L 留空的语义一致。
        const body = (await readJsonBody(request).catch(() => ({}))) as { storyboardOptions?: unknown };
        const storyboardOptions = normalizeDramaLabStoryboardOptions(body.storyboardOptions);

        const child = await startDramaLabWorkflow({
            userId: user.id,
            projectId: id,
            sourceEpisodeId: episodeId,
            requestId: `one-click-film:storyboard:${id}:${episodeId}:${Date.now()}`,
            options: {
                mode: "storyboard_extract",
                scope: "current",
                autoExport: false,
                ...(Object.keys(storyboardOptions).length ? { storyboardOptions } : {}),
            },
            origin: resolveInternalOrigin(resolvePublicRequestOrigin(request)),
            cookie: request.headers.get("cookie") || "",
        });
        const advanced = await advanceDramaLabWorkflow({
            userId: user.id,
            taskId: child.id,
            origin: resolveInternalOrigin(resolvePublicRequestOrigin(request)),
            cookie: request.headers.get("cookie") || "",
        });
        if (!advanced) return NextResponse.json({ code: 500, data: null, msg: "分镜拆解子任务不存在" }, { status: 500 });

        const view = dramaLabWorkflowTaskView(advanced);
        if (view.status === "error") return NextResponse.json({ code: 502, data: null, msg: view.error || "分镜拆解失败" }, { status: 502 });

        return NextResponse.json({ code: 0, data: { taskId: view.id, status: view.status }, msg: "分镜拆解任务已创建，正在后台处理..." });
    } catch (error) {
        // 参数不合法是调用方问题，回 400；其余才是 500。
        const status = error instanceof DramaLabStoryboardOptionsError ? 400 : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "分镜拆解失败" }, { status });
    }
}
