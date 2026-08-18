import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getPracticeSessionForUser } from "@/lib/server/practice-session-service";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    try {
        const session = await getPracticeSessionForUser(user, (await context.params).id);
        return NextResponse.json({ code: 0, data: { session }, msg: "OK" });
    } catch (error) {
        const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "练习会话请求失败" }, { status });
    }
}
