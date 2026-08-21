/**
 * Drama Lab API - Project Detail
 *
 * 替代 LocalMiniDrama 的 /api/v1/dramas/:id 接口
 */

import { NextResponse } from "next/server";
import { readJsonBody } from "@/lib/auth/request";
import { getCurrentUser } from "@/lib/auth/session";
import { getDramaProject, updateDramaProject } from "@/lib/server/drama-project-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/drama-lab/projects/:id
 * 获取项目详情
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const project = await getDramaProject(id, user.id);

        if (!project) {
            return NextResponse.json({ code: 404, msg: "项目不存在" }, { status: 404 });
        }

        return NextResponse.json({
            code: 0,
            data: { project },
            msg: "OK",
        });
    } catch (error) {
        console.error("[drama-lab/projects/:id] GET error:", error);
        return NextResponse.json(
            {
                code: 500,
                msg: error instanceof Error ? error.message : "项目加载失败",
            },
            { status: 500 },
        );
    }
}

/**
 * PUT /api/drama-lab/projects/:id
 * 更新项目
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const body = await readJsonBody<Record<string, unknown>>(request, 2 * 1024 * 1024);

        // 获取现有项目
        const existing = await getDramaProject(id, user.id);
        if (!existing) {
            return NextResponse.json({ code: 404, msg: "项目不存在" }, { status: 404 });
        }

        // 合并更新
        const updated = {
            ...existing,
            ...body,
            id, // 保持 ID 不变
            updatedAt: new Date().toISOString(),
        };

        await updateDramaProject(user.id, updated, existing.updatedAt);

        return NextResponse.json({
            code: 0,
            data: { project: updated },
            msg: "项目更新成功",
        });
    } catch (error) {
        console.error("[drama-lab/projects/:id] PUT error:", error);

        if (error instanceof Error && error.message.includes("已在其他页面更新")) {
            return NextResponse.json({ code: 409, msg: error.message }, { status: 409 });
        }

        return NextResponse.json(
            {
                code: 500,
                msg: error instanceof Error ? error.message : "项目更新失败",
            },
            { status: 500 },
        );
    }
}

/**
 * DELETE /api/drama-lab/projects/:id
 * 删除项目
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ code: 401, msg: "请先登录" }, { status: 401 });
    }

    try {
        const { id } = await params;

        const { deleteDramaProject } = await import("@/lib/server/drama-project-store");
        await deleteDramaProject(user.id, id);

        return NextResponse.json({
            code: 0,
            msg: "项目删除成功",
        });
    } catch (error) {
        console.error("[drama-lab/projects/:id] DELETE error:", error);
        return NextResponse.json(
            {
                code: 500,
                msg: error instanceof Error ? error.message : "项目删除失败",
            },
            { status: 500 },
        );
    }
}
