import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { deleteScriptProject, getScriptProjectDetail, updateScriptProject } from "@/lib/server/script-practice-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
    return withUser(request, context, async (user, id) => ok(await getScriptProjectDetail(user.id, id)));
}
export async function PATCH(request: Request, context: Context) {
    return withUser(request, context, async (user, id) => {
        const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 256 * 1024);
        if (!parsed.ok) return response(parsed.status, parsed.message);
        await requirePracticeAccess(user, "script");
        return ok(
            await updateScriptProject(user.id, id, {
                ...(typeof parsed.data.title === "string" ? { title: parsed.data.title.trim() } : {}),
                ...(typeof parsed.data.genre === "string" ? { genre: parsed.data.genre.trim() } : {}),
                ...(typeof parsed.data.logline === "string" ? { logline: parsed.data.logline.trim() } : {}),
                ...(typeof parsed.data.synopsis === "string" ? { synopsis: parsed.data.synopsis.trim() } : {}),
                ...(parsed.data.status === "draft" || parsed.data.status === "writing" || parsed.data.status === "completed" ? { status: parsed.data.status } : {}),
            }),
        );
    });
}
export async function DELETE(request: Request, context: Context) {
    return withUser(request, context, async (user, id) => {
        await requirePracticeAccess(user, "script");
        return ok(await deleteScriptProject(user.id, id));
    });
}
async function withUser(request: Request, context: Context, action: (user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, id: string) => Promise<Response>) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    try {
        await requirePracticeAccess(user, "script");
        return await action(user, (await context.params).id);
    } catch (error) {
        return failure(error, "剧本项目请求失败");
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
