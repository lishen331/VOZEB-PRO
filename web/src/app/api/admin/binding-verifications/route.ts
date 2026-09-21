import { after, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { hasAdminPermission } from "@/lib/admin-permissions";
import { readJsonBody } from "@/lib/auth/request";
import { resolvePublicRequestOrigin } from "@/lib/server/public-request-origin";
import { startBindingVerification, advanceBindingVerification, publicBindingVerification } from "@/lib/server/binding-verification-runner";
export const runtime = "nodejs";
export const maxDuration = 2400;
export async function POST(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(user, "upstream.manage")) return NextResponse.json({ error: "需要上游配置管理员权限" }, { status: 403 });
    try {
        const body = await readJsonBody<{ logicalModelId?: unknown; bindingId?: unknown; input?: unknown }>(request);
        if (typeof body.logicalModelId !== "string" || typeof body.bindingId !== "string") return NextResponse.json({ error: "缺少逻辑模型与绑定 ID" }, { status: 400 });
        const publicOrigin = resolvePublicRequestOrigin(request);
        const run = await startBindingVerification({ logicalModelId: body.logicalModelId, bindingId: body.bindingId, input: body.input, user, publicOrigin });
        after(() => advanceBindingVerification(run.id, user, publicOrigin, request.headers.get("cookie") || "").then(() => undefined));
        return NextResponse.json({ test: publicBindingVerification(run) }, { status: 202 });
    } catch (error) {
        return NextResponse.json({ error: error instanceof Error ? error.message : "创建验证失败" }, { status: 400 });
    }
}
