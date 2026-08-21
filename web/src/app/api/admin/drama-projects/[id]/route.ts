import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { getDramaProject, deleteDramaProject } from "@/lib/server/drama-project-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;

        // 管理员可以查看任何用户的项目，所以不传 userId
        const project = await getDramaProject(id, user.id);

        if (!project) {
            return NextResponse.json({ code: 404, msg: "Project not found" }, { status: 404 });
        }

        return NextResponse.json({
            code: 0,
            data: { project },
            msg: "OK",
        });
    } catch (error) {
        console.error("Failed to fetch drama project:", error);
        return NextResponse.json({ code: 500, msg: "Internal Server Error" }, { status: 500 });
    }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;

        // 先检查项目是否存在
        const project = await getDramaProject(id, user.id);
        if (!project) {
            return NextResponse.json({ code: 404, msg: "Project not found" }, { status: 404 });
        }

        // 删除项目
        await deleteDramaProject(user.id, id);

        return NextResponse.json({
            code: 0,
            msg: "OK",
        });
    } catch (error) {
        console.error("Failed to delete drama project:", error);
        return NextResponse.json({ code: 500, msg: "Internal Server Error" }, { status: 500 });
    }
}
