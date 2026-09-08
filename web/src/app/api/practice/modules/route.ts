import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { getPracticeModuleConfiguration } from "@/lib/server/practice-module-service";

export async function GET(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    try {
        const data = await getPracticeModuleConfiguration(user);
        return NextResponse.json({ code: 200, data, msg: "ok" });
    } catch (error) {
        const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
        return response(status, error instanceof Error ? error.message : "练习模块读取失败");
    }
}

function response(code: number, msg: string) {
    return NextResponse.json({ code, data: null, msg }, { status: code });
}
