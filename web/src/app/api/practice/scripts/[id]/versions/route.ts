import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { createScriptPracticeRepository } from "@/lib/server/database/script-practice-repository";
import { normalizeScriptDocument } from "@/lib/script-practice-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    try {
        await requirePracticeAccess(user);
        const id = (await context.params).id;
        const repository = createScriptPracticeRepository();
        const project = await repository.getScriptProject(id, user.id);
        if (!project) return response(404, "剧本项目不存在");
        return ok(await repository.listScriptVersions(id, user.id));
    } catch (error) {
        return failure(error, "读取剧本版本失败");
    }
}
export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 512 * 1024);
    if (!parsed.ok) return response(parsed.status, parsed.message);
    try {
        await requirePracticeAccess(user);
        const id = (await context.params).id;
        const repository = createScriptPracticeRepository();
        const project = await repository.getScriptProject(id, user.id);
        if (!project) return response(404, "剧本项目不存在");
        if (!parsed.data.document || typeof parsed.data.document !== "object" || Array.isArray(parsed.data.document)) return response(400, "剧本文档无效");
        const document = normalizeScriptDocument(parsed.data.document, { projectId: id, version: Number(parsed.data.version) || 1 });
        const versionNumber = await repository.nextScriptVersionNumber(id, user.id);
        const version = await repository.createScriptVersion(
            {
                id: typeof parsed.data.id === "string" && parsed.data.id.trim() ? parsed.data.id.trim() : crypto.randomUUID(),
                projectId: id,
                documentSnapshot: { ...document, version: versionNumber },
                source: parsed.data.source === "import" ? "import" : parsed.data.source === "restore" ? "restore" : "user",
                operation: typeof parsed.data.operation === "string" ? parsed.data.operation.trim() : undefined,
                parentVersionId: typeof parsed.data.parentVersionId === "string" ? parsed.data.parentVersionId.trim() : undefined,
                createdAt: new Date().toISOString(),
            },
            user.id,
        );
        if (!version) return response(404, "剧本项目不存在");
        if (!(await repository.compareAndSetCurrentVersion(id, user.id, project.currentVersionId, version.id))) return response(409, "剧本版本已变化，请刷新后重试");
        return ok(version);
    } catch (error) {
        return failure(error, "保存剧本版本失败");
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
