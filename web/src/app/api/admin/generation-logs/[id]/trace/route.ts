import { hasAdminPermission } from "@/lib/admin-permissions";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { readGenerationLogTrace } from "@/lib/server/generation-log-trace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return NextResponse.json({ error: "请先登录" }, { status: 401 });
    if (!hasAdminPermission(currentUser, "generation.read")) return NextResponse.json({ error: "当前管理员没有查看生成记录的职责权限" }, { status: 403 });

    const { id } = await context.params;
    const trace = await readGenerationLogTrace(id);
    if (!trace) return NextResponse.json({ error: "没有关联的生成任务" }, { status: 404 });
    return NextResponse.json({ trace });
}
