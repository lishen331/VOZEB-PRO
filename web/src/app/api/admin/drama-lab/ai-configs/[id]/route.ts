import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { hasAnyAdminPermission } from "@/lib/admin-permissions";
import { legacyReadOnly } from "../../_lib";

function authorizeLegacyConfig(user: Awaited<ReturnType<typeof getCurrentUser>>) {
    if (!user || !hasAnyAdminPermission(user, ["content.manage"])) {
        return NextResponse.json({ code: 401, msg: "Unauthorized" }, { status: 401 });
    }
    return null;
}

export async function PUT() {
    const unauthorized = authorizeLegacyConfig(await getCurrentUser());
    if (unauthorized) return unauthorized;
    return legacyReadOnly("历史 AI 配置仅支持查看，请到平台模型渠道维护实际运行配置");
}

export async function DELETE() {
    const unauthorized = authorizeLegacyConfig(await getCurrentUser());
    if (unauthorized) return unauthorized;
    return legacyReadOnly("历史 AI 配置仅支持查看，请到平台模型渠道维护实际运行配置");
}
