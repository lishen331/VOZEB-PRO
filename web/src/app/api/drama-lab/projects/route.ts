/**
 * Drama Lab API - Projects List
 *
 * 替代 LocalMiniDrama 的 /api/v1/dramas 接口
 * 集成到 VOZEB PRO 的 drama_projects 架构中
 */

import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { listDramaProjectSummaries } from "@/lib/server/drama-project-store";
import { createDramaProjectForUser, DramaProjectServiceError } from "@/lib/server/drama-project-service";
import { ensureDramaLabProjectGroup, listDramaLabProjectsForUser } from "@/lib/server/drama-lab-collaboration-service";
import { FeatureModuleDisabledError, requireFeatureModuleEnabled } from "@/lib/server/feature-module-access";

export const dynamic = "force-dynamic";

/**
 * GET /api/drama-lab/projects
 * 获取用户的短剧项目列表
 */
export async function GET(request: Request) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    }

    try {
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get("page") || "1", 10);
        const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

        // Backfill groups for legacy projects owned by this user before listing
        // the collaboration graph. This keeps pre-Phase-3 projects visible
        // while allowing approved members to see the same list.
        const owned = await listDramaProjectSummaries(user.id, { page: 1, pageSize: 100, executionProfile: "production" });
        await Promise.all(owned.items.map((project) => ensureDramaLabProjectGroup(project.id, user.id).catch(() => undefined)));
        const result = await listDramaLabProjectsForUser(user.id, {
            page: Math.max(1, page),
            pageSize: Math.min(100, Math.max(1, pageSize)),
        });

        return NextResponse.json({
            code: 0,
            data: {
                projects: result.items,
                total: result.total,
                page: result.page,
                pageSize: result.pageSize,
            },
            msg: "OK",
        });
    } catch (error) {
        console.error("[drama-lab/projects] GET error:", error);
        return NextResponse.json(
            {
                code: 500,
                msg: error instanceof Error ? error.message : "项目列表加载失败",
            },
            { status: 500 },
        );
    }
}

/**
 * POST /api/drama-lab/projects
 * 创建新的短剧项目
 */
export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    }

    try {
        await requireFeatureModuleEnabled("drama-lab");
        const body = await readJsonBody<Record<string, unknown>>(request, 256 * 1024);
        const { title, summary, style, storyStyle, scriptType, ratio } = body;

        if (!title || typeof title !== "string" || !title.trim()) {
            return NextResponse.json({ code: 400, msg: "项目标题不能为空" }, { status: 400 });
        }

        const created = await createDramaProjectForUser(user.id, {
            title: title.trim(),
            summary: typeof summary === "string" ? summary.trim() : "",
            style: typeof style === "string" && style.trim() ? style.trim() : "电影感国漫",
            ...(typeof storyStyle === "string" && storyStyle.trim() ? { storyStyle: storyStyle.trim() } : {}),
            ...(typeof scriptType === "string" && scriptType.trim() ? { scriptType: scriptType.trim() } : {}),
            ratio: typeof ratio === "string" && ratio.trim() ? ratio.trim() : "16:9",
        });
        await ensureDramaLabProjectGroup(created.id, user.id);

        return NextResponse.json({
            code: 0,
            data: { project: { id: created.id, title: created.title } },
            msg: "项目创建成功",
        });
    } catch (error) {
        console.error("[drama-lab/projects] POST error:", error);
        if (error instanceof FeatureModuleDisabledError) return NextResponse.json({ code: 403, msg: error.message }, { status: 403 });
        if (error instanceof DramaProjectServiceError) return NextResponse.json({ code: error.status, msg: error.message }, { status: error.status });
        return NextResponse.json(
            {
                code: 500,
                msg: error instanceof Error ? error.message : "项目创建失败",
            },
            { status: 500 },
        );
    }
}
