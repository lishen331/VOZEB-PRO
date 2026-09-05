import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";

export async function POST(_request: NextRequest, { params: _params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ code: 410, msg: "历史 AI 配置未接入运行链路，请到平台模型渠道发起真实验证", data: null }, { status: 410 });
}
