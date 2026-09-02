import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        if (!id) {
            return NextResponse.json({ code: 400, msg: "配置 ID 不能为空" }, { status: 400 });
        }

        return NextResponse.json(
            {
                code: 410,
                msg: "该历史 AI 配置未接入运行链路，请到平台模型渠道发起真实验证",
                data: null,
            },
            { status: 410 },
        );
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
