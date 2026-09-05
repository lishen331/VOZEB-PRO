import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getVideoTask } from "@/lib/server/video-task-store";

export const dynamic = "force-dynamic";

/**
 * GET /api/video-generation-tasks/:id
 * 查询视频生成任务状态
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user) {
        return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const task = await getVideoTask(id);

        if (!task) {
            return NextResponse.json({ error: "任务不存在" }, { status: 404 });
        }

        // 检查任务所有者
        if (task.userId !== user.id) {
            return NextResponse.json({ error: "无权访问此任务" }, { status: 403 });
        }

        return NextResponse.json({ task });
    } catch (error) {
        console.error("[video-generation-tasks/:id] GET error:", error);
        return NextResponse.json({ error: error instanceof Error ? error.message : "查询失败" }, { status: 500 });
    }
}
