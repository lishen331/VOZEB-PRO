import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { getBindingVerification } from "@/lib/server/binding-verification-store";
import { advanceBindingVerification, publicBindingVerification } from "@/lib/server/binding-verification-runner";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 2400;
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "upstream.manage")) return NextResponse.json({ error: "需要上游配置管理员权限" }, { status: 403 });
    const { id } = await context.params;
    const current = await getBindingVerification(id);
    if (!current || current.userId !== user.id) return NextResponse.json({ error: "验证不存在或无权访问" }, { status: 404 });
    try {
        const run = await advanceBindingVerification(id, user, resolvePublicRequestOrigin(request), request.headers.get("cookie") || "");
        return NextResponse.json({ test: publicBindingVerification(run) });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "查询验证失败" }, { status: 400 });
    }
}
