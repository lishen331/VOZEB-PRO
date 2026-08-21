import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        if (!id) {
            return NextResponse.json({ code: 400, msg: "配置 ID 不能为空" }, { status: 400 });
        }

        // TODO: 实际测试 AI 配置
        // 这里应该调用对应的 AI 服务进行测试

        // 模拟测试成功
        await new Promise((resolve) => setTimeout(resolve, 1000));

        return NextResponse.json({
            code: 0,
            msg: "测试成功",
            data: {
                latency: Math.floor(Math.random() * 1000) + 500,
                status: "ok",
            },
        });
    } catch (error) {
        console.error("Failed to test AI config:", error);
        return NextResponse.json(
            {
                code: 500,
                msg: error instanceof Error ? error.message : "测试失败",
            },
            { status: 500 },
        );
    }
}
