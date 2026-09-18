import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProjectForUser, updateDramaProjectForUser } from "@/lib/server/drama-project-service";
import { OneClickCleanupError, removeOneClickImageRecord } from "@/lib/server/one-click-film/generation-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 删除一条分镜图生成记录，对应 L `DELETE /images/:id`。
 *
 * 纯数据清理，不调用模型，因此不涉及计费。
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; shotId: string; recordId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId, recordId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new OneClickCleanupError("当前剧集不能为空");

        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickCleanupError("一键成片项目不存在", 404);

        const result = removeOneClickImageRecord(project, episodeId, shotId, recordId);
        // L 在没有匹配行时回 '记录不存在'，这里保持同样的 404 语义。
        if (!result.removed) return NextResponse.json({ code: 404, data: null, msg: "记录不存在" }, { status: 404 });

        const saved = await updateDramaProjectForUser(user.id, id, result.project);
        return NextResponse.json({ code: 0, data: { project: saved }, msg: "删除成功" });
    } catch (error) {
        const status = error instanceof OneClickCleanupError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "删除失败" }, { status });
    }
}

/**
 * 把一条分镜图生成记录设为本镜主图（对应 L 从候选里挑一张的动作）。
 *
 * 序列图模式（四宫格/九宫格）拆出的每一格都是一条记录，用户靠这个接口挑机位。
 * 普通生成记录同样可用，等价于"回退到上一版分镜图"。
 *
 * 为什么单开一个动作而不是走通用 PATCH：`storyboardImageUrl` 故意不在
 * shot-crud 的可编辑白名单里 —— 否则调用方能把主图指向任意外部 URL。
 * 这里只允许指向**本镜历史里已存在**的记录，地址由服务端从记录里取，不接受客户端传入。
 *
 * 纯数据操作，不调用模型，不计费。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; shotId: string; recordId: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const { id, shotId, recordId } = await params;
        const episodeId = new URL(request.url).searchParams.get("episodeId")?.trim() || "";
        if (!episodeId) throw new OneClickCleanupError("当前剧集不能为空");

        const project = await getDramaProjectForUser(user.id, id);
        if (!project.sourceHandoffId?.startsWith("one-click-film:")) throw new OneClickCleanupError("一键成片项目不存在", 404);

        const episode = project.episodes.find((item) => item.id === episodeId);
        const shot = episode?.shots.find((item) => item.id === shotId);
        if (!shot) throw new OneClickCleanupError("分镜不存在", 404);

        const record = shot.storyboardHistory?.find((item) => item.id === recordId);
        if (!record?.url) return NextResponse.json({ code: 404, data: null, msg: "记录不存在" }, { status: 404 });

        const next = {
            ...project,
            episodes: project.episodes.map((item) =>
                item.id !== episodeId
                    ? item
                    : {
                          ...item,
                          shots: item.shots.map((current) =>
                              current.id !== shotId
                                  ? current
                                  : {
                                        ...current,
                                        storyboardImageUrl: record.url,
                                        storyboardImageWidth: record.width,
                                        storyboardImageHeight: record.height,
                                        // 选定即视为该镜分镜图已就绪，清掉上一次的报错。
                                        storyboardStatus: "success" as const,
                                        storyboardError: undefined,
                                    },
                          ),
                      },
            ),
            updatedAt: new Date().toISOString(),
        };

        const saved = await updateDramaProjectForUser(user.id, id, next);
        return NextResponse.json({ code: 0, data: { project: saved, url: record.url }, msg: "已设为本镜分镜图" });
    } catch (error) {
        const status = error instanceof OneClickCleanupError ? error.status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "设置分镜图失败" }, { status });
    }
}
