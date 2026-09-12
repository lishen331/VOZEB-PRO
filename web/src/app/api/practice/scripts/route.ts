import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { createScriptProject, listScriptProjects } from "@/lib/server/script-practice-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    try {
        await requirePracticeAccess(user, "script");
        const params = new URL(request.url).searchParams;
        return ok(
            await listScriptProjects(user.id, {
                page: number(params.get("page")),
                pageSize: number(params.get("pageSize")),
                keyword: params.get("keyword") || undefined,
                status: params.get("status") === "draft" || params.get("status") === "writing" || params.get("status") === "completed" ? (params.get("status") as "draft" | "writing" | "completed") : undefined,
            }),
        );
    } catch (error) {
        return failure(error, "读取剧本项目失败");
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 512 * 1024);
    if (!parsed.ok) return response(parsed.status, parsed.message);
    try {
        await requirePracticeAccess(user, "script");
        if (!parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) return response(400, "请求参数无效");
        const title = typeof parsed.data.title === "string" ? parsed.data.title.trim() : "";
        if (!title) return response(400, "请填写剧本标题");
        return ok(
            await createScriptProject(user.id, {
                title,
                sourceType: parsed.data.sourceType === "fountain" || parsed.data.sourceType === "fdx" || parsed.data.sourceType === "text" || parsed.data.sourceType === "markdown" ? parsed.data.sourceType : "idea",
                ...(typeof parsed.data.idea === "string" ? { idea: parsed.data.idea } : {}),
            }),
        );
    } catch (error) {
        return failure(error, "创建剧本项目失败");
    }
}
function number(value: string | null) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
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
