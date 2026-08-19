import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getPracticeProject } from "@/lib/server/practice-project-service";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser(request);
    if (!user) return NextResponse.json({ code: 401, data: null, msg: "请先登录" }, { status: 401 });
    const kind = new URL(request.url).searchParams.get("kind") === "drama" ? "drama" : "canvas";
    try {
        const result = await getPracticeProject(user, kind, (await context.params).id);
        return NextResponse.json({ code: 0, data: result, msg: "OK" });
    } catch (error) {
        const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
        return NextResponse.json({ code: status, data: null, msg: error instanceof Error ? error.message : "练习项目请求失败" }, { status });
    }
}
