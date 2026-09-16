import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { readJsonBodyResult } from "@/lib/auth/request";
import { requirePracticeAccess } from "@/lib/server/practice-access-service";
import { createScriptPracticeRepository } from "@/lib/server/database/script-practice-repository";
import { applyScriptPatch } from "@/lib/server/script-practice-stage-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string; operation: string }> };
export async function POST(request: Request, context: Context) {
    const user = await getCurrentUser(request);
    if (!user) return response(401, "请先登录");
    const parsed = await readJsonBodyResult<Record<string, unknown>>(request, 256 * 1024);
    if (!parsed.ok) return response(parsed.status, parsed.message);
    try {
        await requirePracticeAccess(user, "script");
        const params = await context.params;
        if (params.operation !== "rewrite_selection" && params.operation !== "expand_selection" && params.operation !== "polish_selection" && params.operation !== "enhance_conflict") return response(400, "剧本 Agent 操作无效");
        const targetBlockIds = Array.isArray(parsed.data.targetBlockIds)
            ? parsed.data.targetBlockIds
                  .filter((item): item is string => typeof item === "string")
                  .map((item) => item.trim())
                  .filter(Boolean)
            : [];
        const baseVersionId = typeof parsed.data.baseVersionId === "string" ? parsed.data.baseVersionId.trim() : "";
        const currentVersionId = typeof parsed.data.currentVersionId === "string" ? parsed.data.currentVersionId.trim() : "";
        const proposedAfter = typeof parsed.data.proposedAfter === "string" ? parsed.data.proposedAfter.trim() : "";
        if (!baseVersionId || !currentVersionId || !targetBlockIds.length || !proposedAfter) return response(400, "修改建议参数不完整");
        return ok(
            await applyScriptPatch(createScriptPracticeRepository(), user.id, {
                projectId: params.id,
                baseVersionId,
                currentVersionId,
                targetBlockIds,
                operation: params.operation as never,
                before: typeof parsed.data.before === "string" ? parsed.data.before : "",
                proposedAfter,
            }),
        );
    } catch (error) {
        return failure(error, "应用剧本修改失败");
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
