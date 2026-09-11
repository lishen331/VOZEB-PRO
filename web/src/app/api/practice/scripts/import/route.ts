import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { importScriptProject } from "@/lib/server/script-practice-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 5 * 1024 * 1024);
    if (!parsed.ok) return response(parsed.status, parsed.message);
    try {
        await requirePracticeAccess(user);
        if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) return response(400, "请求参数无效");
        const format = parsed.data.format;
        if (format !== "fountain" && format !== "fdx" && format !== "text" && format !== "markdown") return response(400, "不支持的剧本格式");
        if (typeof parsed.data.content !== "string" || !parsed.data.content.trim()) return response(400, "剧本内容不能为空");
        return ok(await importScriptProject(user.id, { title: typeof parsed.data.title === "string" ? parsed.data.title.trim() : "导入剧本", format, content: parsed.data.content, confirm: parsed.data.confirm === true }));
    } catch (error) {
        return failure(error, "导入剧本失败");
    }
}
function ok<T>(data: T) {
    return NextResponse.json({ code: 0, data, msg: "ok" });
}
function response(code: number, msg: string) {
    return NextResponse.json({ code, data: null, msg }, { status: code });
}
function failure(error: unknown, fallback: string) {
    const status = error && typeof error === "object" && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    return response(status, status === 500 ? fallback : error instanceof Error ? error.message : fallback);
}
