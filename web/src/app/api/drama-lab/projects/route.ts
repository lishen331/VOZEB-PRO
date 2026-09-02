/**
 * Drama Lab API - Projects List
 *
 * 替代 LocalMiniDrama 的 /api/v1/dramas 接口
 * 集成到 VOZEB PRO 的 drama_projects 架构中
 */

import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import type { DramaProject } from "@/lib/drama-project-contract";
import { listDramaProjectSummaries } from "@/lib/server/drama-project-store";
import { ensureDramaLabProjectGroup, listDramaLabProjectsForUser } from "@/lib/server/drama-lab-collaboration-service";

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
        const body = await readJsonBody<Record<string, unknown>>(request, 256 * 1024);
        const { title, summary, style, ratio } = body;

        if (!title || typeof title !== "string" || !title.trim()) {
            return NextResponse.json({ code: 400, msg: "项目标题不能为空" }, { status: 400 });
        }

        const summaryText = typeof summary === "string" ? summary.trim() : "";
        const styleText = typeof style === "string" ? style.trim() : "电影感写实";
        const ratioText = typeof ratio === "string" && ratio.trim() ? ratio.trim() : "9:16";

        // 生成项目 ID
        const projectId = `drama-lab-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const now = new Date().toISOString();

        // 创建项目结构
        const project: DramaProject = {
            id: projectId,
            title: title.trim(),
            summary: summaryText,
            style: styleText,
            ratio: ratioText,
            status: "active" as const,
            episodes: [],
            characters: [],
            scenes: [],
            props: [],
            clues: [],
            defaultVideoMode: "storyboard",
            createdAt: now,
            updatedAt: now,
        };

        const { createDramaProject } = await import("@/lib/server/drama-project-store");
        const created = await createDramaProject(user.id, project);
        await ensureDramaLabProjectGroup(created.id, user.id);

        return NextResponse.json({
            code: 0,
            data: { project: { id: created.id, title: created.title } },
            msg: "项目创建成功",
        });
    } catch (error) {
        console.error("[drama-lab/projects] POST error:", error);
        return NextResponse.json(
            {
                code: 500,
                msg: error instanceof Error ? error.message : "项目创建失败",
            },
            { status: 500 },
        );
    }
}
