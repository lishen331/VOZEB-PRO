import { NextResponse } from "next/server";

import { DEFAULT_SITE_SETTINGS, getAuthSettings } from "@/lib/auth/store";
import { getCurrentUser, serializeCurrentUser, serializePublicIdentitySettings, serializePublicSettings } from "@/lib/auth/session";
import { getInstallStatus } from "@/lib/server/install-status";

export const runtime = "nodejs";

export async function GET() {
    let user = null;
    try {
        user = await getCurrentUser();
    } catch {
        user = null;
    }

    if (user) {
        try {
            const settings = await getAuthSettings();
            return NextResponse.json({
                user: serializeCurrentUser(user),
                settings: serializePublicSettings(settings),
                install: { ready: true, firstAdminRequired: false, database: { healthy: true, schemaReady: true } },
            });
        } catch {
            user = null;
        }
    }

    const install = await getInstallStatus();
    if (!install.database.healthy || !install.database.schemaReady) {
        return NextResponse.json({ user: null, settings: { site: DEFAULT_SITE_SETTINGS }, install });
    }

    const settings = await getAuthSettings();
    // A1-b: 未登录只下发身份侧最小配置，不再把 logicalModels/systemChannels 等
    // 重配置暴露给匿名请求（既是攻击面收敛，也省带宽）。匿名用户无法发起生成，
    // 不需要模型目录。见实施文档步骤 3。
    return NextResponse.json({
        user: null,
        settings: serializePublicIdentitySettings(settings),
        install,
    });
}
