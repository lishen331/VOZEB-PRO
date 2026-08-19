import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { createPracticeProject, listPracticeProjects } from "@/lib/server/practice-project-service";

export async function GET(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    const params = new URL(request.url).searchParams;
    const kind = params.get("kind") === "drama" ? "drama" : "canvas";
    try {
        const result = await listPracticeProjects(user, { kind, page: params.get("page"), pageSize: params.get("pageSize") });
        return NextResponse.json({ code: 0, data: { projects: result.kind === "canvas" ? result.projects : result.items, total: result.total, page: result.page, pageSize: result.pageSize, kind }, msg: "OK" });
    } catch (error) {
        return knownError(error);
    }
}

export async function POST(request: Request) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    const parsed = await readJsonBodyResult<unknown>(request, 64 * 1024);
    if (!parsed.ok) return response(parsed.status, parsed.message);
    try {
        const body = parsed.data && typeof parsed.data === "object" && !Array.isArray(parsed.data) ? (parsed.data as Record<string, unknown>) : {};
        const kind = body.kind === "drama" ? "drama" : body.kind === "canvas" ? "canvas" : "";
        if (!kind) return response(400, "项目类型无效");
        const result = await createPracticeProject(user, { kind, title: typeof body.title === "string" ? body.title : "", source: body.source as never, references: body.references as never });
        return NextResponse.json({ code: 0, data: result, msg: "练习项目已创建" });
    } catch (error) {
        return knownError(error);
    }
}

function knownError(error: unknown) {
    const status = typeof error === "object" && error && "status" in error && typeof (error as { status?: unknown }).status === "number" ? (error as { status: number }).status : 500;
    const message = error instanceof Error ? error.message : "练习项目请求失败";
    return response(status, message);
}

function response(code: number, msg: string) {
    return NextResponse.json({ code, data: null, msg }, { status: code });
}
