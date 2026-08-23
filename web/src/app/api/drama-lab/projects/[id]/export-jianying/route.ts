import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { exportDramaEpisodeAsJianying, DramaJianyingExportError } from "@/lib/server/drama-jianying-export";
import { resolveInternalOrigin } from "@/lib/server/internal-origin";
import { db } from "@/lib/server/database/client";
import { dramaProjects } from "@/lib/server/database/schema-drama-lab";
import { eq, and } from "drizzle-orm";

export const runtime = "nodejs";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json(
            { code: 401, data: null, msg: "请先登录" },
            { status: 401 }
        );
    }

    try {
        // 解析请求参数
        const parsed = await readJsonBodyResult<{
            episodeId?: string;
            draftPath?: string;
            version?: string;
        }>(request);

        if (!parsed.ok) {
            return NextResponse.json(
                { code: parsed.status, data: null, msg: parsed.message },
                { status: parsed.status }
            );
        }

        const body = parsed.data;
        const projectId = (await context.params).id;

        // 从数据库获取项目
        const [projectRow] = await db
            .select()
            .from(dramaProjects)
            .where(
                and(
                    eq(dramaProjects.id, projectId),
                    eq(dramaProjects.userId, user.id)
                )
            )
            .limit(1);

        if (!projectRow) {
            return NextResponse.json(
                { code: 404, data: null, msg: "项目不存在" },
                { status: 404 }
            );
        }

        // 解析项目数据
        const projectData = projectRow.projectJson as {
            title: string;
            description?: string;
            style?: string;
            aspectRatio?: string;
            episodes: Array<{
                id: string;
                episodeNumber: number;
                title: string;
                script?: string;
            }>;
            shots: Array<{
                id: string;
                episodeId: string;
                shotNumber: number;
                script: string;
                dialogue?: string;
                narration?: string;
                subtitle?: string;
                imageUrl?: string;
                videoUrl?: string;
                audioUrl?: string;
                duration: number;
            }>;
        };

        // 查找指定集
        const episode = projectData.episodes.find(
            (ep) => ep.id === String(body.episodeId || "")
        );

        if (!episode) {
            return NextResponse.json(
                { code: 404, data: null, msg: "短剧剧集不存在" },
                { status: 404 }
            );
        }

        // 筛选该集的分镜
        const episodeShots = projectData.shots.filter(
            (shot) => shot.episodeId === episode.id
        );

        // 转换为剪映导出所需的格式
        const dramaProject = {
            id: projectRow.id,
            title: projectData.title,
            ratio: projectData.aspectRatio || "16:9",
            episodes: projectData.episodes.map((ep) => ({
                id: ep.id,
                title: ep.title,
                shots: projectData.shots.filter((s) => s.episodeId === ep.id),
            })),
        };

        const dramaEpisode = {
            id: episode.id,
            title: episode.title,
            shots: episodeShots.map((shot) => ({
                id: shot.id,
                videoUrl: shot.videoUrl,
                audioUrl: shot.audioUrl,
                duration: shot.duration,
                subtitle: shot.subtitle || shot.dialogue || shot.narration || "",
                dialogue: shot.dialogue || "",
                narration: shot.narration || "",
            })),
        };

        // 调用剪映导出服务
        const result = await exportDramaEpisodeAsJianying({
            project: dramaProject as any,
            episode: dramaEpisode as any,
            draftPath: String(body.draftPath || ""),
            version: body.version === "5" ? "5" : "6",
            origin: resolveInternalOrigin(new URL(request.url).origin),
            cookie: request.headers.get("cookie") || "",
        });

        // 返回 ZIP 文件
        return new Response(result.data, {
            headers: {
                "Content-Type": "application/zip",
                "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(result.fileName)}`,
                "Content-Length": String(result.data.byteLength),
            },
        });
    } catch (error) {
        if (error instanceof DramaJianyingExportError) {
            return NextResponse.json(
                { code: error.status, data: null, msg: error.message },
                { status: error.status }
            );
        }

        console.error("[drama-lab] jianying export failed:", error);
        return NextResponse.json(
            { code: 500, data: null, msg: "剪映草稿导出失败" },
            { status: 500 }
        );
    }
}
